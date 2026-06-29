import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transfer-orders_/new")({
  head: () => ({ meta: [{ title: "New Transfer Order — Nimbus ERP" }] }),
  component: NewTransferOrderPage,
});

type Line = { item_id: string; quantity: number };

function NewTransferOrderPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const [source, setSource] = useState("");
  const [dest, setDest] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ item_id: "", quantity: 1 }]);
  const [saving, setSaving] = useState(false);

  const { data: warehouses = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["wh-active", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations" as any)
        .select("id, name, status").eq("tenant_id", tenantId!).eq("status", "active").order("name");
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["items-active", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("items")
        .select("id, name, sku, stock_on_hand").eq("tenant_id", tenantId!).eq("is_active", true).order("name");
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const { data: sourceStock = [] } = useQuery({
    enabled: !!tenantId && !!source,
    queryKey: ["wh-stock", source],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouse_stock" as any)
        .select("item_id, quantity, reserved_quantity").eq("warehouse_id", source);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const availableFor = (item_id: string) => {
    const row = sourceStock.find((s: any) => s.item_id === item_id);
    return row ? Number(row.quantity) - Number(row.reserved_quantity) : 0;
  };

  const sameWh = source && dest && source === dest;
  const valid = useMemo(() => source && dest && !sameWh && lines.some((l) => l.item_id && l.quantity > 0), [source, dest, sameWh, lines]);

  const save = async () => {
    if (!tenantId || !valid) return toast.error("Fill source, destination and at least one item");
    setSaving(true);
    try {
      const { data: num } = await supabase.rpc("next_doc_number", { _tenant: tenantId, _doc_type: "transfer_order" });
      const { data: order, error } = await supabase.from("transfer_orders" as any).insert({
        tenant_id: tenantId,
        transfer_number: num,
        source_warehouse_id: source,
        destination_warehouse_id: dest,
        transfer_date: date,
        notes: notes || null,
        status: "draft",
      }).select("id").single();
      if (error) throw error;

      const itemRows = lines.filter((l) => l.item_id && l.quantity > 0).map((l, i) => ({
        tenant_id: tenantId, transfer_order_id: (order as any).id, item_id: l.item_id, quantity_requested: l.quantity, position: i,
      }));
      const { error: e2 } = await supabase.from("transfer_order_items" as any).insert(itemRows);
      if (e2) throw e2;
      toast.success("Transfer order created");
      navigate({ to: "/transfer-orders/$id", params: { id: (order as any).id } });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/transfer-orders" })}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-semibold">New Transfer Order</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/transfer-orders" })}>Cancel</Button>
          <Button onClick={save} disabled={saving || !valid} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving…" : "Save as Draft"}</Button>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Source Warehouse *</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Destination Warehouse *</Label>
            <Select value={dest} onValueChange={setDest}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
            {sameWh && <p className="text-xs text-rose-600">Source and destination must differ.</p>}
          </div>
          <div className="space-y-2">
            <Label>Transfer Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Items</h2>
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { item_id: "", quantity: 1 }])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Row
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Available @ Source</TableHead>
              <TableHead className="text-right">Transfer Quantity</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, idx) => {
              const avail = source ? availableFor(l.item_id) : null;
              const over = avail != null && l.quantity > avail;
              return (
                <TableRow key={idx}>
                  <TableCell>
                    <Select value={l.item_id} onValueChange={(v) => setLines(lines.map((x, i) => i === idx ? { ...x, item_id: v } : x))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>
                        {items.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {source ? (l.item_id ? avail : "—") : "Select source"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" min={0} step="0.01" className={`h-9 text-right tabular-nums ${over ? "border-rose-500" : ""}`}
                      value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
