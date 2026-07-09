import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CheckCircle2, Pencil, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/production-orders_/$id")({
  head: () => ({ meta: [{ title: "Production Order — Nimbus ERP" }] }),
  component: ProductionOrderDetail,
});

function ProductionOrderDetail() {
  const { id } = Route.useParams();
  const { data: profile } = useProfile();
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: order } = useQuery({
    queryKey: ["production-order", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("assembly_orders")
        .select("*, items:assembly_item_id(id, name, sku, cost_price, stock_on_hand), assembly_consumptions(id, quantity_used, unit_cost, items:component_item_id(name, sku))")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (!order) return <div className="text-muted-foreground">Loading…</div>;

  const complete = async () => {
    if (!confirm(`Complete this production order? Components will be consumed and ${order.quantity} unit(s) of ${order.items?.name} added to stock.`)) return;
    const { error } = await supabase.rpc("complete_assembly_order", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Production order completed");
    qc.invalidateQueries({ queryKey: ["production-order", id] });
    qc.invalidateQueries({ queryKey: ["production-orders"] });
  };

  const cancel = async () => {
    if (!confirm("Cancel this production order?")) return;
    const { error } = await (supabase as any)
      .from("assembly_orders")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Production order cancelled");
    qc.invalidateQueries({ queryKey: ["production-order", id] });
    qc.invalidateQueries({ queryKey: ["production-orders"] });
  };

  const remove = async () => {
    if (!confirm("Delete this production order? This cannot be undone.")) return;
    const { error } = await (supabase as any).from("assembly_orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Production order deleted");
    qc.invalidateQueries({ queryKey: ["production-orders"] });
    navigate({ to: "/production-orders" });
  };

  const cons = order.assembly_consumptions ?? [];
  const totalCost = cons.reduce((s: number, c: any) => s + Number(c.quantity_used) * Number(c.unit_cost), 0);
  const editable = order.status !== "completed" && order.status !== "cancelled";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/production-orders" })}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-semibold">{order.order_number ?? "Production Order"}</h1>
          <Badge variant={order.status === "completed" ? "default" : order.status === "cancelled" ? "destructive" : "secondary"} className="capitalize">{order.status}</Badge>
        </div>
        <div className="flex gap-2">
          {editable && (
            <Button variant="outline" onClick={() => navigate({ to: "/production-orders/$id/edit", params: { id } })}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          {editable && (
            <Button variant="outline" onClick={cancel}>
              <XCircle className="h-4 w-4 mr-2" /> Cancel
            </Button>
          )}
          {order.status !== "completed" && (
            <Button variant="outline" onClick={remove} className="text-rose-600 hover:text-rose-700">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          )}
          {editable && (
            <Button onClick={complete} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4 mr-2" /> Complete Production</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Item</div><div className="font-medium">{order.items?.name}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Quantity</div><div className="font-medium tabular-nums">{Number(order.quantity)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Component Cost</div><div className="font-medium">{formatCurrency(totalCost, currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Completed</div><div className="font-medium">{order.completed_at ? formatDate(order.completed_at) : "—"}</div></Card>
      </div>

      {order.notes && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Notes</div>
          <div className="text-sm whitespace-pre-wrap">{order.notes}</div>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b font-semibold">Component Consumption</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Quantity Used</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!cons.length ? (
              <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No consumption recorded yet. Complete the order to consume components.</TableCell></TableRow>
            ) : cons.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell>{c.items?.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.items?.sku ?? ""}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(c.quantity_used)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(c.unit_cost, currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(Number(c.quantity_used) * Number(c.unit_cost), currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
