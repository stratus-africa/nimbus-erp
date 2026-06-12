import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Trash2, Plus, Save } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { calculateCompositeAvailability, calculateCompositeCost } from "@/lib/composite-utils";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/production-items_/$id")({
  head: () => ({ meta: [{ title: "Production Item — Nimbus ERP" }] }),
  component: CompositeDetail,
});

type EditorLine = {
  id?: string;
  component_item_id: string;
  quantity: number;
  unit_cost: number;
};

function CompositeDetail() {
  const { id } = Route.useParams();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["composite-item", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("composite_items")
        .select("*, items:parent_item_id(*), composite_item_components(id, quantity, unit_cost, items:component_item_id(id, name, sku, stock_on_hand, item_type, cost_price))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: itemOptions } = useQuery({
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

  const [lines, setLines] = useState<EditorLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setLines(
      (data.composite_item_components ?? []).map((c: any) => ({
        id: c.id,
        component_item_id: c.items?.id ?? "",
        quantity: Number(c.quantity),
        unit_cost: Number(c.unit_cost),
      })),
    );
  }, [data]);

  const parent: any = data?.items;

  const enrichedLines = useMemo(
    () =>
      lines.map((l) => {
        const it = itemOptions?.find((x: any) => x.id === l.component_item_id);
        return {
          ...l,
          name: it?.name as string | undefined,
          sku: it?.sku as string | undefined,
          stock_on_hand: Number(it?.stock_on_hand ?? 0),
          item_type: it?.item_type as string | undefined,
        };
      }),
    [lines, itemOptions],
  );

  const totalCost = calculateCompositeCost(lines);
  const availability = calculateCompositeAvailability(
    enrichedLines
      .filter((l) => l.component_item_id && l.quantity > 0)
      .map((l) => ({
        quantity: Number(l.quantity),
        stock_on_hand: l.item_type === "inventory" ? Number(l.stock_on_hand) : Infinity,
      })),
  );
  const margin = Number(parent?.selling_price ?? 0) - totalCost;

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;

  const pickItem = (idx: number, itemId: string) => {
    const it = itemOptions?.find((x: any) => x.id === itemId);
    setLines((ls) =>
      ls.map((l, i) =>
        i === idx ? { ...l, component_item_id: itemId, unit_cost: Number(it?.cost_price ?? l.unit_cost) } : l,
      ),
    );
  };

  const saveComponents = async () => {
    if (!tenantId) return;
    const valid = lines.filter((l) => l.component_item_id && l.quantity > 0);
    if (!valid.length) return toast.error("Add at least one component");
    const ids = valid.map((l) => l.component_item_id);
    if (new Set(ids).size !== ids.length) return toast.error("Duplicate components are not allowed");

    setSaving(true);
    try {
      // Replace strategy: delete all existing components, then insert.
      const { error: delErr } = await supabase
        .from("composite_item_components")
        .delete()
        .eq("composite_item_id", id);
      if (delErr) throw delErr;

      const { error: insErr } = await supabase.from("composite_item_components").insert(
        valid.map((l) => ({
          tenant_id: tenantId,
          composite_item_id: id,
          component_item_id: l.component_item_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
        })),
      );
      if (insErr) throw insErr;

      // Recompute parent item cost_price from total component cost.
      if (parent?.id) {
        await supabase.from("items").update({ cost_price: totalCost }).eq("id", parent.id);
      }

      toast.success("Components updated");
      qc.invalidateQueries({ queryKey: ["composite-item", id] });
      qc.invalidateQueries({ queryKey: ["production-items"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this production item?")) return;
    const { error } = await supabase.from("composite_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate({ to: "/production-items" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/production-items" })}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-semibold">{parent?.name}</h1>
          <Badge variant="outline" className="capitalize">{data.composite_type}</Badge>
          <Badge variant={data.status === "active" ? "default" : "secondary"} className="capitalize">{data.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={remove} className="text-rose-600"><Trash2 className="h-4 w-4 mr-2" /> Delete</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">SKU</div><div className="font-medium">{parent?.sku ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Selling Price</div><div className="font-medium">{formatCurrency(parent?.selling_price ?? 0, currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Cost</div><div className="font-medium">{formatCurrency(totalCost, currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Available to Build</div><div className="font-medium">{isFinite(availability) ? availability : "—"}</div></Card>
      </div>

      <Tabs defaultValue="components">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card className="p-6 space-y-3">
            <div><div className="text-xs text-muted-foreground">Description</div><div>{data.description || "—"}</div></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><div className="text-xs text-muted-foreground">Barcode</div><div>{parent?.barcode || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Category</div><div>{parent?.category || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Margin</div><div className={margin >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatCurrency(margin, currency)}</div></div>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="components">
          <Card>
            <div className="flex items-center justify-between border-b p-3">
              <h2 className="font-semibold">Edit Components</h2>
              <Button size="sm" disabled={saving} onClick={saveComponents} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">On-hand</TableHead>
                  <TableHead className="text-right w-28">Quantity</TableHead>
                  <TableHead className="text-right w-28">Unit Cost</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Impact / Build</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedLines.map((l, idx) => {
                  const subtotal = Number(l.quantity) * Number(l.unit_cost);
                  const impactPerBuild = Number(l.quantity);
                  return (
                    <TableRow key={l.id ?? `new-${idx}`}>
                      <TableCell>
                        <Select value={l.component_item_id} onValueChange={(v) => pickItem(idx, v)}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select item" /></SelectTrigger>
                          <SelectContent>
                            {itemOptions?.map((x: any) => (
                              <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.sku ?? ""}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.item_type === "inventory" ? l.stock_on_hand : "—"}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right"
                          value={l.quantity}
                          onChange={(e) =>
                            setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x)))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right"
                          value={l.unit_cost}
                          onChange={(e) =>
                            setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, unit_cost: parseFloat(e.target.value) || 0 } : x)))
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(subtotal, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums text-rose-600">−{impactPerBuild}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t p-3">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setLines((ls) => [...ls, { component_item_id: "", quantity: 1, unit_cost: 0 }])}
              >
                <Plus className="h-4 w-4" /> Add component
              </Button>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Available to build: </span>
                  <span className="tabular-nums font-medium">{isFinite(availability) ? availability : "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total cost: </span>
                  <span className="tabular-nums font-medium">{formatCurrency(totalCost, currency)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Margin: </span>
                  <span className={`tabular-nums font-medium ${margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {formatCurrency(margin, currency)}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="transactions">
          <Card className="p-6 text-sm text-muted-foreground">
            Composite sales transactions will be listed here once invoices using this kit are posted.
          </Card>
        </TabsContent>
        <TabsContent value="activity">
          <Card className="p-6 text-sm text-muted-foreground">
            Created {formatDate(data.created_at)} · last updated {formatDate(data.updated_at)}
          </Card>
        </TabsContent>
      </Tabs>
      <button hidden onClick={() => qc.invalidateQueries()}>refresh</button>
      <div className="text-xs text-muted-foreground">
        On-hand impact: producing 1 unit of <strong>{parent?.name}</strong> will deduct the quantity shown above from each component's stock.
        {isFinite(availability) && (
          <> Current components support up to <strong>{availability}</strong> build(s).</>
        )}
      </div>
    </div>
  );
}
