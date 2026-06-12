import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { calculateCompositeCost } from "@/lib/composite-utils";

export const Route = createFileRoute("/_authenticated/composite-items_/new")({
  head: () => ({ meta: [{ title: "New Composite Item — Nimbus ERP" }] }),
  component: NewCompositePage,
});

type Line = { component_item_id: string; quantity: number; unit_cost: number };

function NewCompositePage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("");
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [compositeType, setCompositeType] = useState<"kit" | "assembly">("kit");
  const [status, setStatus] = useState<"active" | "inactive" | "draft">("active");
  const [lines, setLines] = useState<Line[]>([{ component_item_id: "", quantity: 1, unit_cost: 0 }]);
  const [saving, setSaving] = useState(false);

  const { data: items } = useQuery({
    enabled: !!tenantId,
    queryKey: ["items-for-composite", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("id, name, sku, cost_price, stock_on_hand, item_type, is_active")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("item_type", ["inventory", "non_inventory", "service"])
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const pickItem = (idx: number, id: string) => {
    const it = items?.find((x: any) => x.id === id);
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, component_item_id: id, unit_cost: Number(it?.cost_price ?? 0) } : l)));
  };

  const totalCost = useMemo(() => calculateCompositeCost(lines), [lines]);
  const margin = Number(sellingPrice) - totalCost;

  const save = async () => {
    if (!tenantId) return;
    if (!name.trim()) return toast.error("Name is required");
    const valid = lines.filter((l) => l.component_item_id && l.quantity > 0);
    if (!valid.length) return toast.error("Add at least one component");
    const ids = valid.map((l) => l.component_item_id);
    if (new Set(ids).size !== ids.length) return toast.error("Duplicate components are not allowed");

    setSaving(true);
    try {
      // 1. Create parent item
      const itemType = compositeType === "assembly" ? "assembly" : "composite";
      const { data: parent, error: pe } = await supabase
        .from("items")
        .insert({
          tenant_id: tenantId,
          name: name.trim(),
          sku: sku.trim() || null,
          barcode: barcode.trim() || null,
          category: category.trim() || null,
          description: description.trim() || null,
          selling_price: sellingPrice,
          cost_price: totalCost,
          item_type: itemType as any,
          unit: "unit",
          stock_on_hand: 0,
        })
        .select("id")
        .single();
      if (pe) throw pe;

      // 2. Composite parent row
      const { data: comp, error: ce } = await supabase
        .from("composite_items")
        .insert({
          tenant_id: tenantId,
          parent_item_id: parent.id,
          composite_type: compositeType,
          status,
          description: description.trim() || null,
        })
        .select("id")
        .single();
      if (ce) throw ce;

      // 3. Component lines
      const compRows = valid.map((l) => ({
        tenant_id: tenantId,
        composite_item_id: comp.id,
        component_item_id: l.component_item_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
      }));
      const { error: le } = await supabase.from("composite_item_components").insert(compRows);
      if (le) throw le;

      toast.success("Composite item created");
      navigate({ to: "/composite-items/$id", params: { id: comp.id } });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/composite-items" })}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-semibold">New Composite Item</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/composite-items" })}>Cancel</Button>
          <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>SKU</Label><Input value={sku} onChange={(e) => setSku(e.target.value)} /></div>
          <div className="space-y-2"><Label>Barcode</Label><Input value={barcode} onChange={(e) => setBarcode(e.target.value)} /></div>
          <div className="space-y-2"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div className="space-y-2"><Label>Selling Price</Label><Input type="number" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)} /></div>
          <div className="space-y-2">
            <Label>Composite Type</Label>
            <Select value={compositeType} onValueChange={(v: any) => setCompositeType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="kit">Kit / Bundle</SelectItem>
                <SelectItem value="assembly">Assembly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Components</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right w-32">Quantity</TableHead>
              <TableHead className="text-right w-32">Unit Cost</TableHead>
              <TableHead className="text-right w-32">Subtotal</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, idx) => {
              const it = items?.find((x: any) => x.id === l.component_item_id);
              return (
                <TableRow key={idx}>
                  <TableCell>
                    <Select value={l.component_item_id} onValueChange={(v) => pickItem(idx, v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>{items?.map((x: any) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{it?.sku ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{it?.item_type === "inventory" ? Number(it?.stock_on_hand ?? 0) : "—"}</TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x))} /></TableCell>
                  <TableCell><Input className="h-8 text-right" type="number" step="0.01" value={l.unit_cost} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, unit_cost: parseFloat(e.target.value) || 0 } : x))} /></TableCell>
                  <TableCell className="text-right tabular-nums">{(Number(l.quantity) * Number(l.unit_cost)).toFixed(2)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t p-3">
          <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { component_item_id: "", quantity: 1, unit_cost: 0 }])} className="gap-2"><Plus className="h-4 w-4" /> Add component</Button>
          <div className="flex gap-6 text-sm">
            <div><span className="text-muted-foreground">Total cost: </span><span className="tabular-nums font-medium">{totalCost.toFixed(2)}</span></div>
            <div><span className="text-muted-foreground">Margin: </span><span className={`tabular-nums font-medium ${margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{margin.toFixed(2)}</span></div>
          </div>
        </div>
      </Card>
    </div>
  );
}
