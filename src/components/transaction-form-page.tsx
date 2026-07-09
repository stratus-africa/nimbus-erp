import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DocConfig } from "@/components/transactions-module";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { FileText, Plus, Settings, Trash2, X, AlertTriangle } from "lucide-react";
import { useCVSettings } from "@/hooks/use-cv-settings";
import { applyCompositeExplosion } from "@/lib/composite-explode";

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

export type TransactionFormPageProps = {
  config: DocConfig;
  tenantId: string;
  currency: string;
  initial?: any;
  /** Where to go after save / cancel. */
  backTo: string;
};

export function TransactionFormPage({
  config,
  tenantId,
  currency,
  initial,
  backTo,
}: TransactionFormPageProps) {
  const navigate = useNavigate();
  const [partyId, setPartyId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [date2, setDate2] = useState<string>("");
  const [status, setStatus] = useState(config.statuses[0].value);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [reference, _setReference] = useState("");
  void reference; void _setReference;
  const [lines, setLines] = useState<Line[]>([
    { description: "", quantity: 1, rate: 0, tax_rate: 0, line_total: 0, position: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const { data: parties } = useQuery({
    queryKey: [config.partyTable, tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from(config.partyTable)
        .select("id, name")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const isCustomerDoc = config.partyTable === "customers";
  const enforcesCredit = isCustomerDoc && config.kind === "invoice";
  const { settings: cvSettings } = useCVSettings();
  const includeSOs = !!cvSettings?.includeSalesOrdersInCreditLimit;

  const { data: customerCredit } = useQuery({
    enabled: enforcesCredit && !!partyId && !!cvSettings?.customerCreditLimitEnabled,
    queryKey: [
      "customer-credit-exposure",
      tenantId,
      partyId,
      includeSOs,
      initial?.id ?? null,
      config.kind,
    ],
    queryFn: async () => {
      const { data: c } = await supabase
        .from("customers").select("credit_limit, name").eq("id", partyId).maybeSingle();
      const limit = Number((c as any)?.credit_limit ?? 0);

      // Open invoices (always count toward exposure)
      let openInvoices = 0;
      {
        let q = (supabase as any).from("invoices").select("balance_due, id")
          .eq("tenant_id", tenantId).eq("customer_id", partyId)
          .not("status", "in", "(paid,cancelled,draft)");
        if (initial?.id && config.kind === "invoice") q = q.neq("id", initial.id);
        const { data } = await q;
        openInvoices = (data ?? []).reduce((s: number, r: any) => s + Number(r.balance_due ?? 0), 0);
      }

      // Open sales orders (only when the tenant setting includes them)
      let openSOs = 0;
      if (includeSOs) {
        const { data } = await (supabase as any).from("sales_orders").select("total, id")
          .eq("tenant_id", tenantId).eq("customer_id", partyId)
          .not("status", "in", "(cancelled,closed,draft)");
        openSOs = (data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      }
      return { limit, exposure: openInvoices + openSOs, name: (c as any)?.name ?? "" };
    },
  });

  const { data: items } = useQuery({
    queryKey: ["items-pick", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("id, name, selling_price, cost_price")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (initial) {
      setPartyId(initial[config.partyField] ?? "");
      setDate(initial[config.dateField] ?? new Date().toISOString().slice(0, 10));
      setDate2(initial[config.secondaryDateField] ?? "");
      setStatus(initial.status ?? config.statuses[0].value);
      setNotes(initial.notes ?? "");
      setTerms(initial.terms ?? "");
      supabase
        .from(config.linesTable)
        .select("*")
        .eq(config.fkLinesField, initial.id)
        .order("position")
        .then(({ data }) => {
          if (data && data.length) setLines(data as any);
        });
    }
  }, [initial, config]);

  const subtotal = lines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0),
    0,
  );
  const tax = lines.reduce(
    (s, l) =>
      s +
      Number(l.quantity || 0) *
        Number(l.rate || 0) *
        (Number(l.tax_rate || 0) / 100),
    0,
  );
  const total = subtotal + tax;

  const creditLimit = Number(customerCredit?.limit ?? 0);
  const existingDocAmount = enforcesCredit && initial?.id ? Number(initial?.balance_due ?? initial?.total ?? 0) : 0;
  const projectedExposure = (customerCredit?.exposure ?? 0) - existingDocAmount + Number(total || 0);
  const exceedsCredit =
    !!cvSettings?.customerCreditLimitEnabled &&
    enforcesCredit &&
    creditLimit > 0 &&
    projectedExposure > creditLimit;
  const creditAction = cvSettings?.creditLimitExceededAction ?? "warn";

  const addLine = () =>
    setLines((ls) => [
      ...ls,
      { description: "", quantity: 1, rate: 0, tax_rate: 0, line_total: 0, position: ls.length },
    ]);
  const removeLine = (idx: number) =>
    setLines((ls) => ls.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l, i) => {
        if (i !== idx) return l;
        const merged = { ...l, ...patch };
        merged.line_total =
          Number(merged.quantity || 0) * Number(merged.rate || 0);
        return merged;
      }),
    );
  const pickItem = (idx: number, itemId: string) => {
    const it = items?.find((x: any) => x.id === itemId);
    if (!it) return;
    const rate =
      config.partyTable === "customers"
        ? Number(it.selling_price ?? 0)
        : Number(it.cost_price ?? 0);
    updateLine(idx, { item_id: itemId, description: it.name, rate });
  };

  const onSubmit = async (sendAfter: boolean) => {
    if (!partyId)
      return toast.error(`Please select a ${config.partyLabel.toLowerCase()}`);
    if (lines.length === 0) return toast.error("Add at least one line");
    if (exceedsCredit) {
      const overBy = projectedExposure - creditLimit;
      if (creditAction === "restrict") {
        return toast.error(
          `Credit limit exceeded by ${overBy.toFixed(2)} ${currency}. Cannot save this invoice.`,
        );
      }
      const ok = window.confirm(
        `${customerCredit?.name ?? "Customer"} will exceed their credit limit of ${creditLimit.toFixed(2)} ${currency} by ${overBy.toFixed(2)} ${currency}. Continue?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      let docId = initial?.id as string | undefined;
      const finalStatus = sendAfter
        ? config.kind === "invoice"
          ? "sent"
          : "sent"
        : status;
      const docPayload: any = {
        tenant_id: tenantId,
        [config.partyField]: partyId,
        [config.dateField]: date,
        status: finalStatus,
        notes: [notes, terms ? `\n\nTerms:\n${terms}` : ""].join("").trim() || null,
        subtotal,
        tax_total: tax,
        total,
      };
      if (config.secondaryDateField && date2)
        docPayload[config.secondaryDateField] = date2;
      if (config.kind === "invoice" || config.kind === "bill") {
        docPayload.amount_paid = initial?.amount_paid ?? 0;
        docPayload.balance_due = total - Number(initial?.amount_paid ?? 0);
      }
      if (!docId) {
        const { data: num, error: ne } = await supabase.rpc("next_doc_number", {
          _tenant: tenantId,
          _doc_type: config.docTypeForNumbering,
        });
        if (ne) throw ne;
        docPayload[config.numberField] = num;
        const { data, error } = await supabase
          .from(config.docTable)
          .insert(docPayload)
          .select("id")
          .single();
        if (error) throw error;
        docId = data.id;
      } else {
        const { error } = await supabase
          .from(config.docTable)
          .update(docPayload)
          .eq("id", docId);
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
      const { error: le } = await supabase
        .from(config.linesTable)
        .insert(lineRows as any);
      if (le) throw le;

      // Auto-explode any composite (kit) items into component reservations / deductions.
      const k = config.kind as string;
      if (docId && (k === "invoice" || k === "quote" || k === "sales_order")) {
        try {
          await applyCompositeExplosion(
            tenantId,
            k as "invoice" | "quote" | "sales_order",
            docId,
            lines.map((l) => ({ item_id: l.item_id ?? null, quantity: l.quantity })),
          );
        } catch (e: any) {
          console.warn("Composite explosion failed", e?.message);
        }
      }

      toast.success(sendAfter ? "Saved and sent" : "Saved");
      navigate({ to: backTo });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const title = initial
    ? `Edit ${config.kind.replace("_", " ")} ${initial[config.numberField] ?? ""}`
    : `New ${config.kind.replace("_", " ")}`;

  return (
    <div className="-m-6 flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold capitalize">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <div className="h-5 w-px bg-border" />
          <button
            onClick={() => navigate({ to: backTo })}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <div className="w-full p-6">

          {/* Top fields */}
          <div className="rounded-md border bg-muted/20 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
              <Label className="pt-2 text-rose-600">{config.partyLabel} Name *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="max-w-md">
                  <SelectValue
                    placeholder={`Select or add a ${config.partyLabel.toLowerCase()}`}
                  />
                </SelectTrigger>
                <SelectContent>
                  {parties?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {enforcesCredit && cvSettings?.customerCreditLimitEnabled && customerCredit && creditLimit > 0 && (
              <div className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${exceedsCredit ? "border-rose-300 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50/70 text-amber-900"}`}>
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <div>
                    Credit limit <span className="font-medium">{creditLimit.toFixed(2)} {currency}</span> ·
                    Open balance <span className="font-medium">{(customerCredit.exposure - existingDocAmount).toFixed(2)} {currency}</span> ·
                    This invoice <span className="font-medium">{total.toFixed(2)} {currency}</span>
                  </div>
                  {exceedsCredit && (
                    <div className="font-semibold">
                      Projected exposure {projectedExposure.toFixed(2)} {currency} exceeds limit by {(projectedExposure - creditLimit).toFixed(2)} {currency}.
                      {creditAction === "restrict" ? " Save blocked." : " You'll be asked to confirm on save."}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr_180px_1fr] sm:items-center">
            <Label className="text-rose-600">Date *</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-md"
            />

            {config.secondaryDateField ? (
              <>
                <Label>{config.secondaryDateLabel}</Label>
                <Input
                  type="date"
                  value={date2}
                  onChange={(e) => setDate2(e.target.value)}
                  className="max-w-md"
                />
              </>
            ) : (
              <>
                <div />
                <div />
              </>
            )}

            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.statuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items */}
          <div className="mt-8">
            <div className="rounded-t-md border border-b-0 bg-muted/40 px-4 py-2.5 text-sm font-semibold">
              Item Table
            </div>
            <div className="rounded-b-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead>Item Details</TableHead>
                    <TableHead className="w-24 text-right">Quantity</TableHead>
                    <TableHead className="w-32 text-right">Rate</TableHead>
                    <TableHead className="w-24 text-right">Tax %</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Select
                          value={l.item_id ?? ""}
                          onValueChange={(v) => pickItem(idx, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Type or click to select an item…" />
                          </SelectTrigger>
                          <SelectContent>
                            {items?.map((it: any) => (
                              <SelectItem key={it.id} value={it.id}>
                                {it.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="mt-1 h-8 text-xs"
                          placeholder="Description"
                          value={l.description ?? ""}
                          onChange={(e) =>
                            updateLine(idx, { description: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-right"
                          type="number"
                          step="0.01"
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(idx, {
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-right"
                          type="number"
                          step="0.01"
                          value={l.rate}
                          onChange={(e) =>
                            updateLine(idx, {
                              rate: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-right"
                          type="number"
                          step="0.01"
                          value={l.tax_rate}
                          onChange={(e) =>
                            updateLine(idx, {
                              tax_rate: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(
                          Number(l.quantity || 0) * Number(l.rate || 0),
                          currency,
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t p-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addLine}
                  className="gap-2 text-sky-600"
                >
                  <Plus className="h-4 w-4" /> Add New Row
                </Button>
              </div>
            </div>
          </div>

          {/* Notes + totals */}
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Thank you for your business."
              />
              <p className="text-xs text-muted-foreground">
                Will be displayed on the document.
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 p-4 text-sm">
              <div className="flex justify-between py-1">
                <span>Sub Total</span>
                <span className="tabular-nums">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatCurrency(tax, currency)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
                <span>Total ( {currency} )</span>
                <span className="tabular-nums">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <Label>Terms & Conditions</Label>
            <Textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              placeholder="Enter the terms and conditions of your business."
            />
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex items-center justify-between gap-3 border-t bg-card px-6 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onSubmit(false)}
          >
            {saving ? "Saving…" : "Save as Draft"}
          </Button>
          <Button
            disabled={saving}
            onClick={() => onSubmit(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Save and Send
          </Button>
          <Button variant="ghost" onClick={() => navigate({ to: backTo })}>
            Cancel
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          Total Amount:{" "}
          <span className="font-semibold text-foreground">
            {formatCurrency(total, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
