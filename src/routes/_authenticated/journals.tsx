import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { PageHeader, NewButton, useDialogState } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/journals")({
  head: () => ({ meta: [{ title: "Manual Journals — Nimbus ERP" }] }),
  component: JournalsPage,
});

type JLine = { account_id: string; debit: number; credit: number; description?: string };

function JournalsPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const qc = useQueryClient();
  const dlg = useDialogState<any>();

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["journals", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("journal_entries").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader title="Manual Journals" description="Double-entry journal postings." action={<NewButton onClick={() => dlg.openFor(null)} label="New journal" />} />
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              : !rows?.length ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No journals yet.</TableCell></TableRow>
              : rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.entry_number}</TableCell>
                  <TableCell>{formatDate(r.entry_date)}</TableCell>
                  <TableCell>{r.description ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.total_debit, currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.total_credit, currency)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      <JournalDialog open={dlg.open} onOpenChange={dlg.setOpen} tenantId={tenantId!} currency={currency} onSaved={() => qc.invalidateQueries({ queryKey: ["journals"] })} />
    </div>
  );
}

function JournalDialog({ open, onOpenChange, tenantId, currency, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; currency: string; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<JLine[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: accounts } = useQuery({
    enabled: open,
    queryKey: ["coa-pick", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("chart_of_accounts").select("id, code, name").eq("tenant_id", tenantId).eq("is_active", true).order("code");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().slice(0, 10));
      setDescription(""); setReference("");
      setLines([{ account_id: "", debit: 0, credit: 0 }, { account_id: "", debit: 0, credit: 0 }]);
    }
  }, [open]);

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  const save = async () => {
    if (!balanced) return toast.error("Debits must equal credits");
    if (lines.some((l) => !l.account_id)) return toast.error("All lines need an account");
    setSaving(true);
    try {
      const { data: num } = await supabase.rpc("next_doc_number", { _tenant: tenantId, _doc_type: "journal" });
      const { data: entry, error } = await supabase.from("journal_entries").insert({
        tenant_id: tenantId,
        entry_number: num ?? "",
        entry_date: date,
        description,
        reference,
        total_debit: totalDebit,
        total_credit: totalCredit,
      }).select("id").single();
      if (error) throw error;
      const rows = lines.map((l, i) => ({
        entry_id: entry.id, account_id: l.account_id, debit: l.debit || 0, credit: l.credit || 0, description: l.description, position: i,
      }));
      const { error: le } = await supabase.from("journal_lines").insert(rows);
      if (le) throw le;
      toast.success("Journal posted");
      onSaved(); onOpenChange(false);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>New manual journal</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-2"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-right w-32">Debit</TableHead><TableHead className="text-right w-32">Credit</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Select value={l.account_id} onValueChange={(v) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, account_id: v } : x))}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Account" /></SelectTrigger>
                      <SelectContent>{accounts?.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input className="h-8" value={l.description ?? ""} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} /></TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.debit} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, debit: parseFloat(e.target.value) || 0, credit: 0 } : x))} /></TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.credit} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, credit: parseFloat(e.target.value) || 0, debit: 0 } : x))} /></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t p-2">
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => setLines((ls) => [...ls, { account_id: "", debit: 0, credit: 0 }])}><Plus className="h-4 w-4" /> Add line</Button>
            <div className={`text-sm ${balanced ? "text-success" : "text-destructive"}`}>
              Debits {formatCurrency(totalDebit, currency)} • Credits {formatCurrency(totalCredit, currency)}{!balanced && " — not balanced"}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!balanced || saving} onClick={save}>{saving ? "Saving…" : "Post journal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// keep imports tree-shake friendly
void Textarea;
