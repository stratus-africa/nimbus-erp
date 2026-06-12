import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { calculateCompositeAvailability, calculateCompositeCost } from "@/lib/composite-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/composite-items_/$id")({
  head: () => ({ meta: [{ title: "Composite Item — Nimbus ERP" }] }),
  component: CompositeDetail,
});

function CompositeDetail() {
  const { id } = Route.useParams();
  const { data: profile } = useProfile();
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

  if (isLoading || !data) {
    return <div className="text-muted-foreground">Loading…</div>;
  }

  const parent: any = data.items;
  const comps: any[] = data.composite_item_components ?? [];
  const compLines = comps.map((c) => ({ component_item_id: c.items?.id, quantity: Number(c.quantity), unit_cost: Number(c.unit_cost) }));
  const totalCost = calculateCompositeCost(compLines);
  const avail = calculateCompositeAvailability(comps.map((c) => ({ quantity: Number(c.quantity), stock_on_hand: Number(c.items?.stock_on_hand ?? 0) })));
  const margin = Number(parent?.selling_price ?? 0) - totalCost;

  const remove = async () => {
    if (!confirm("Delete this composite item?")) return;
    const { error } = await supabase.from("composite_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate({ to: "/composite-items" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/composite-items" })}><ArrowLeft className="h-4 w-4" /></Button>
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
        <Card className="p-4"><div className="text-xs text-muted-foreground">Available</div><div className="font-medium">{isFinite(avail) ? avail : "—"}</div></Card>
      </div>

      <Tabs defaultValue="overview">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Available Stock</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comps.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link to="/items/$itemId" params={{ itemId: c.items?.id }} className="text-primary hover:underline">{c.items?.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.items?.sku ?? ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(c.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.items?.item_type === "inventory" ? Number(c.items?.stock_on_hand ?? 0) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.unit_cost, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(c.quantity) * Number(c.unit_cost), currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </div>
  );
}
