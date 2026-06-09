import { createFileRoute } from "@tanstack/react-router";
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
import { PageHeader, NewButton, useDialogState } from "@/components/page-header";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory-adjustments")({
  head: () => ({ meta: [{ title: "Inventory Adjustments — Nimbus ERP" }] }),
  component: AdjustmentsPage,
});

type Line = { item_id: string; qty_before: number; qty_after: number };

function AdjustmentsPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const dlg = useDialogState<any>();

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["inventory-adjustments", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_adjustments")
        .select("*, inventory_adjustment_lines(*, items(name))")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader title="Inventory Adjustments" description="Recount, increase or decrease stock with full audit trail." action={<NewButton onClick={() => dlg.openFor(null)} label="New adjustment" />} />
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Lines</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              : !rows?.length ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No adjustments yet.</TableCell></TableRow>
              : rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.adjustment_number ?? "—"}</TableCell>
                  <TableCell>{formatDate(r.adjustment_date)}</TableCell>
                  <TableCell className="capitalize">{r.adjustment_type}</TableCell>
                  <TableCell>{r.reason ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.inventory_adjustment_lines?.length ?? 0}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
      <AdjustmentDialog open={dlg.open} onOpenChange={dlg.setOpen} tenantId={tenantId!} onSaved={() => qc.invalidateQueries({ queryKey: ["inventory-adjustments"] })} />
    </div>
  );
}

function AdjustmentDialog({ open, onOpenChange, tenantId, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; onSaved: () => void }) {
  const [type, setType] = useState<"increase" | "decrease" | "recount">("recount");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: items } = useQuery({
    enabled: open,
    queryKey: ["items-adj", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("items").select("id, name, stock_on_hand").eq("tenant_id", tenantId).eq("item_type", "inventory").is("deleted_at", null).order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (open) {
      setType("recount"); setDate(new Date().toISOString().slice(0, 10)); setReason(""); setNotes("");
      setLines([{ item_id: "", qty_before: 0, qty_after: 0 }]);
    }
  }, [open]);

  const pickItem = (idx: number, itemId: string) => {
    const it = items?.find((x: any) => x.id === itemId);
    setLines((ls) => ls.map((l, i) => i === idx ? { ...l, item_id: itemId, qty_before: Number(it?.stock_on_hand ?? 0), qty_after: Number(it?.stock_on_hand ?? 0) } : l));
  };

  const save = async () => {
    if (lines.some((l) => !l.item_id)) return toast.error("All lines need an item");
    setSaving(true);
    try {
      const { data: num } = await supabase.rpc("next_doc_number", { _tenant: tenantId, _doc_type: "adjustment" });
      const { data: adj, error } = await supabase.from("inventory_adjustments").insert({
        tenant_id: tenantId,
        adjustment_number: num,
        adjustment_date: date,
        adjustment_type: type,
        reason,
        notes,
      }).select("id").single();
      if (error) throw error;
      const lineRows = lines.map((l) => ({
        adjustment_id: adj.id,
        item_id: l.item_id,
        qty_before: l.qty_before,
        qty_after: l.qty_after,
        variance: Number(l.qty_after) - Number(l.qty_before),
      }));
      const { error: le } = await supabase.from("inventory_adjustment_lines").insert(lineRows);
      if (le) throw le;
      // Update item stock
      for (const l of lines) {
        await supabase.from("items").update({ stock_on_hand: l.qty_after }).eq("id", l.item_id);
      }
      toast.success("Adjustment posted");
      onSaved();
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>New inventory adjustment</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">Increase</SelectItem>
                <SelectItem value="decrease">Decrease</SelectItem>
                <SelectItem value="recount">Recount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Stock count / damage / …" /></div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty before</TableHead><TableHead className="text-right">Qty after</TableHead><TableHead className="text-right">Variance</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Select value={l.item_id} onValueChange={(v) => pickItem(idx, v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>{items?.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.qty_before} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, qty_before: parseFloat(e.target.value) || 0 } : x))} /></TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.qty_after} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, qty_after: parseFloat(e.target.value) || 0 } : x))} /></TableCell>
                  <TableCell className="text-right tabular-nums">{(Number(l.qty_after) - Number(l.qty_before)).toFixed(2)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-2"><Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { item_id: "", qty_before: 0, qty_after: 0 }])} className="gap-2"><Plus className="h-4 w-4" /> Add line</Button></div>
        </div>

        <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Post adjustment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helpers to satisfy unused import lints in tree-shaken builds.
void useMutation;
