import { createFileRoute } from "@tanstack/react-router";
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
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/items")({
  head: () => ({ meta: [{ title: "Items — Nimbus ERP" }] }),
  component: ItemsPage,
});

type Item = {
  id?: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  item_type: "goods" | "service";
  unit?: string | null;
  sale_price?: number | null;
  purchase_price?: number | null;
  track_inventory?: boolean;
  on_hand?: number | null;
};

function ItemsPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const qc = useQueryClient();
  const dlg = useDialogState<Item>();

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["items", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("tenant_id", tenantId!).is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (i: Item) => {
      const payload: any = { ...i, tenant_id: tenantId! };
      const { error } = i.id ? await supabase.from("items").update(payload).eq("id", i.id) : await supabase.from("items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["items"] }); toast.success("Saved"); dlg.setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Items" description="Product and service catalog." action={<NewButton onClick={() => dlg.openFor({ name: "", item_type: "goods" })} label="New item" />} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Sale</TableHead><TableHead className="text-right">Purchase</TableHead><TableHead className="text-right">On hand</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              : !rows?.length ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No items yet.</TableCell></TableRow>
              : rows.map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell>{i.sku ?? "—"}</TableCell>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="capitalize">{i.item_type}</TableCell>
                  <TableCell className="text-right">{new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(i.sale_price ?? 0))}</TableCell>
                  <TableCell className="text-right">{new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(i.purchase_price ?? 0))}</TableCell>
                  <TableCell className="text-right">{i.track_inventory ? Number(i.on_hand ?? 0) : "—"}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => dlg.openFor(i)}>Edit</Button></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      <ItemDialog open={dlg.open} onOpenChange={dlg.setOpen} initial={dlg.data} onSubmit={(i) => upsert.mutate(i)} saving={upsert.isPending} />
    </div>
  );
}

function ItemDialog({ open, onOpenChange, initial, onSubmit, saving }: any) {
  const [i, setI] = useState<Item>({ name: "", item_type: "goods" });
  useEffect(() => { setI(initial ?? { name: "", item_type: "goods" }); }, [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{i.id ? "Edit item" : "New item"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Name *</Label><Input value={i.name} onChange={(e) => setI({ ...i, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>SKU</Label><Input value={i.sku ?? ""} onChange={(e) => setI({ ...i, sku: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={i.item_type} onValueChange={(v: any) => setI({ ...i, item_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="goods">Goods</SelectItem><SelectItem value="service">Service</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Unit</Label><Input value={i.unit ?? ""} onChange={(e) => setI({ ...i, unit: e.target.value })} placeholder="pcs, hrs, kg…" /></div>
          <div className="space-y-2"><Label>Sale price</Label><Input type="number" step="0.01" value={i.sale_price ?? ""} onChange={(e) => setI({ ...i, sale_price: parseFloat(e.target.value) || 0 })} /></div>
          <div className="space-y-2"><Label>Purchase price</Label><Input type="number" step="0.01" value={i.purchase_price ?? ""} onChange={(e) => setI({ ...i, purchase_price: parseFloat(e.target.value) || 0 })} /></div>
          <div className="space-y-2 sm:col-span-2 flex items-center gap-2">
            <input id="ti" type="checkbox" checked={!!i.track_inventory} onChange={(e) => setI({ ...i, track_inventory: e.target.checked })} disabled={i.item_type === "service"} />
            <Label htmlFor="ti">Track inventory</Label>
          </div>
          <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea value={i.description ?? ""} onChange={(e) => setI({ ...i, description: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!i.name || saving} onClick={() => onSubmit(i)}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
