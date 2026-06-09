import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader, NewButton, useDialogState } from "@/components/page-header";
import { formatCurrency, formatDate, statusLabel, STATUS_COLORS } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

/**
 * Reusable transactional document module (invoices / quotes / purchase orders / bills).
 * Each module renders this component with the right config.
 */
export type DocConfig = {
  kind: "invoice" | "quote" | "purchase_order" | "bill";
  title: string;
  description: string;
  docTable: "invoices" | "quotes" | "purchase_orders" | "bills";
  linesTable: "invoice_lines" | "quote_lines" | "purchase_order_lines" | "bill_lines";
  numberField: string;
  dateField: string;
  secondaryDateField: string;
  secondaryDateLabel: string;
  partyField: "customer_id" | "supplier_id";
  partyTable: "customers" | "suppliers";
  partyLabel: string;
  statuses: { value: string; label: string }[];
  docTypeForNumbering: string;
  fkLinesField: string;
};

type Line = {
  id?: string;
  item_id?: string | null;
  description?: string | null;
  quantity: number;
  rate: number;
  tax_rate: number;
  line_total: number;
  position: number;
};

export type TxFilter = { from?: string; to?: string; onlyOpen?: boolean };

export function TransactionsModule({ config, filter, onClearFilter }: { config: DocConfig; filter?: TxFilter; onClearFilter?: () => void }) {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const qc = useQueryClient();
  const dlg = useDialogState<any>();

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: [config.docTable, tenantId, filter?.from, filter?.to, filter?.onlyOpen],
    queryFn: async () => {
      const partyJoin = config.partyTable === "customers" ? "customers(name)" : "suppliers(name)";
      let q = supabase
        .from(config.docTable)
        .select(`*, ${partyJoin}`)
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);
      if (filter?.from) q = q.gte(config.dateField, filter.from);
      if (filter?.to) q = q.lte(config.dateField, filter.to);
      if (filter?.onlyOpen) q = q.gt("balance_due", 0);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const hasFilter = !!(filter?.from || filter?.to || filter?.onlyOpen);

  return (
    <div>
      <PageHeader
        title={config.title}
        description={config.description}
        action={<NewButton onClick={() => dlg.openFor(null)} label={`New ${config.kind.replace("_", " ")}`} />}
      />
      {hasFilter && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Filtered:</span>
          {filter?.onlyOpen && <Badge variant="outline">Open only</Badge>}
          {filter?.from && <Badge variant="outline">From {formatDate(filter.from)}</Badge>}
          {filter?.to && <Badge variant="outline">To {formatDate(filter.to)}</Badge>}
          {onClearFilter && (
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={onClearFilter}>Clear</Button>
          )}
        </div>
      )}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{config.partyLabel}</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nothing here yet.</TableCell></TableRow>
            ) : rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r[config.numberField]}</TableCell>
                <TableCell>{r[config.partyTable]?.name ?? "—"}</TableCell>
                <TableCell>{formatDate(r[config.dateField])}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>{statusLabel(r.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(r.total, currency)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => dlg.openFor(r)}>Open</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <TxDialog
        open={dlg.open}
        onOpenChange={dlg.setOpen}
        initial={dlg.data}
        config={config}
        tenantId={tenantId!}
        currency={currency}
        onSaved={() => qc.invalidateQueries({ queryKey: [config.docTable] })}
      />
    </div>
  );
}

function TxDialog({
  open, onOpenChange, initial, config, tenantId, currency, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: any; config: DocConfig; tenantId: string; currency: string; onSaved: () => void;
}) {
  const [partyId, setPartyId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [date2, setDate2] = useState<string>("");
  const [status, setStatus] = useState(config.statuses[0].value);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: parties } = useQuery({
    enabled: open,
    queryKey: [config.partyTable, tenantId],
    queryFn: async () => {
      const { data } = await supabase.from(config.partyTable).select("id, name").eq("tenant_id", tenantId).is("deleted_at", null).order("name");
      return data ?? [];
    },
  });
  const { data: items } = useQuery({
    enabled: open,
    queryKey: ["items-pick", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("items").select("id, name, selling_price, cost_price").eq("tenant_id", tenantId).is("deleted_at", null).order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setPartyId(initial[config.partyField] ?? "");
      setDate(initial[config.dateField] ?? new Date().toISOString().slice(0, 10));
      setDate2(initial[config.secondaryDateField] ?? "");
      setStatus(initial.status ?? config.statuses[0].value);
      setNotes(initial.notes ?? "");
      // load lines
      supabase.from(config.linesTable).select("*").eq(config.fkLinesField, initial.id).order("position").then(({ data }) => {
        setLines((data ?? []) as any);
      });
    } else {
      setPartyId(""); setDate(new Date().toISOString().slice(0, 10)); setDate2(""); setStatus(config.statuses[0].value); setNotes("");
      setLines([{ description: "", quantity: 1, rate: 0, tax_rate: 0, line_total: 0, position: 0 }]);
    }
  }, [open, initial, config]);

  const subtotal = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0), 0);
  const tax = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0) * (Number(l.tax_rate || 0) / 100), 0);
  const total = subtotal + tax;

  const addLine = () => setLines((ls) => [...ls, { description: "", quantity: 1, rate: 0, tax_rate: 0, line_total: 0, position: ls.length }]);
  const removeLine = (idx: number) => setLines((ls) => ls.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => {
    if (i !== idx) return l;
    const merged = { ...l, ...patch };
    merged.line_total = Number(merged.quantity || 0) * Number(merged.rate || 0);
    return merged;
  }));
  const pickItem = (idx: number, itemId: string) => {
    const it = items?.find((x: any) => x.id === itemId);
    if (!it) return;
    const rate = config.partyTable === "customers" ? Number(it.selling_price ?? 0) : Number(it.cost_price ?? 0);
    updateLine(idx, { item_id: itemId, description: it.name, rate });
  };

  const onSubmit = async () => {
    if (!partyId) return toast.error(`Please select a ${config.partyLabel.toLowerCase()}`);
    if (lines.length === 0) return toast.error("Add at least one line");
    setSaving(true);
    try {
      let docId = initial?.id as string | undefined;
      const docPayload: any = {
        tenant_id: tenantId,
        [config.partyField]: partyId,
        [config.dateField]: date,
        status,
        notes,
        subtotal,
        tax_total: tax,
        total,
      };
      if (config.secondaryDateField && date2) docPayload[config.secondaryDateField] = date2;
      if (config.kind === "invoice" || config.kind === "bill") {
        docPayload.amount_paid = initial?.amount_paid ?? 0;
        docPayload.balance_due = total - Number(initial?.amount_paid ?? 0);
      }
      if (!docId) {
        const { data: num, error: ne } = await supabase.rpc("next_doc_number", { _tenant: tenantId, _doc_type: config.docTypeForNumbering });
        if (ne) throw ne;
        docPayload[config.numberField] = num;
        const { data, error } = await supabase.from(config.docTable).insert(docPayload).select("id").single();
        if (error) throw error;
        docId = data.id;
      } else {
        const { error } = await supabase.from(config.docTable).update(docPayload).eq("id", docId);
        if (error) throw error;
        await supabase.from(config.linesTable).delete().eq(config.fkLinesField, docId);
      }
      const lineRows = lines.map((l, i) => ({
        [config.fkLinesField]: docId,
        item_id: l.item_id || null,
        description: l.description || null,
        quantity: l.quantity,
        rate: l.rate,
        tax_rate: l.tax_rate,
        line_total: Number(l.quantity || 0) * Number(l.rate || 0),
        position: i,
      }));
      const { error: le } = await supabase.from(config.linesTable).insert(lineRows as any);
      if (le) throw le;
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? `Edit ${config.kind.replace("_", " ")} ${initial[config.numberField]}` : `New ${config.kind.replace("_", " ")}`}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>{config.partyLabel} *</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder={`Select ${config.partyLabel.toLowerCase()}`} /></SelectTrigger>
              <SelectContent>
                {parties?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{config.secondaryDateLabel}</Label>
            <Input type="date" value={date2} onChange={(e) => setDate2(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {config.statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item / Description</TableHead>
                <TableHead className="w-20 text-right">Qty</TableHead>
                <TableHead className="w-28 text-right">Rate</TableHead>
                <TableHead className="w-20 text-right">Tax %</TableHead>
                <TableHead className="w-28 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Select value={l.item_id ?? ""} onValueChange={(v) => pickItem(idx, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select item…" /></SelectTrigger>
                      <SelectContent>
                        {items?.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="mt-1 h-8 text-xs" placeholder="Description" value={l.description ?? ""} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                  </TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: parseFloat(e.target.value) || 0 })} /></TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.rate} onChange={(e) => updateLine(idx, { rate: parseFloat(e.target.value) || 0 })} /></TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.tax_rate} onChange={(e) => updateLine(idx, { tax_rate: parseFloat(e.target.value) || 0 })} /></TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(Number(l.quantity || 0) * Number(l.rate || 0), currency)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => removeLine(idx)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" onClick={addLine} className="gap-2"><Plus className="h-4 w-4" /> Add line</Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1 rounded-md bg-muted/50 p-4 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal, currency)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(tax, currency)}</span></div>
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{formatCurrency(total, currency)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={onSubmit}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
