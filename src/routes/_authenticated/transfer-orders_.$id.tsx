import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle2, Truck, PackageCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/transfer-orders_/$id")({
  head: () => ({ meta: [{ title: "Transfer Order — Nimbus ERP" }] }),
  component: TransferOrderDetail,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", confirmed: "outline", shipped: "outline", received: "outline", completed: "default", cancelled: "destructive",
};

function TransferOrderDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<null | "confirm" | "ship" | "receive" | "cancel">(null);

  const { data: order } = useQuery({
    queryKey: ["transfer-order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transfer_orders" as any)
        .select("*, src:source_warehouse_id(name), dst:destination_warehouse_id(name), transfer_order_items(id, quantity_requested, quantity_shipped, quantity_received, items:item_id(name, sku))")
        .eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["transfer-tx", id],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_transactions" as any)
        .select("id, transaction_type, quantity, created_at, items:item_id(name), wh:warehouse_id(name)")
        .eq("reference_type", "transfer_orders").eq("reference_id", id)
        .order("created_at", { ascending: false });
      return (data as any) ?? [];
    },
  });

  if (!order) return <div className="text-muted-foreground">Loading…</div>;

  const callRpc = async (name: string) => {
    const { error } = await supabase.rpc(name as any, { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Done");
    qc.invalidateQueries({ queryKey: ["transfer-order", id] });
    qc.invalidateQueries({ queryKey: ["transfer-tx", id] });
    qc.invalidateQueries({ queryKey: ["transfer-orders"] });
  };

  const runConfirmed = () => {
    if (!confirmAction) return;
    const map = { confirm: "confirm_transfer_order", ship: "ship_transfer_order", receive: "receive_transfer_order", cancel: "cancel_transfer_order" };
    callRpc(map[confirmAction]);
    setConfirmAction(null);
  };

  const lines = order.transfer_order_items ?? [];

  const canConfirm = order.status === "draft";
  const canShip = order.status === "confirmed" || (order.status === "shipped" && lines.some((l: any) => l.quantity_shipped < l.quantity_requested));
  const canReceive = (order.status === "shipped" || order.status === "received") && lines.some((l: any) => l.quantity_received < l.quantity_shipped);
  const canCancel = !["completed", "cancelled"].includes(order.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/transfer-orders" })}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-semibold">{order.transfer_number}</h1>
          <Badge variant={STATUS_VARIANT[order.status] ?? "secondary"} className="capitalize">{order.status}</Badge>
        </div>
        <div className="flex gap-2">
          {canConfirm && <Button onClick={() => setConfirmAction("confirm")} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1.5 h-4 w-4" /> Confirm</Button>}
          {canShip && <Button onClick={() => setConfirmAction("ship")} className="bg-blue-600 hover:bg-blue-700"><Truck className="mr-1.5 h-4 w-4" /> Ship</Button>}
          {canReceive && <Button onClick={() => setConfirmAction("receive")} className="bg-emerald-600 hover:bg-emerald-700"><PackageCheck className="mr-1.5 h-4 w-4" /> Receive</Button>}
          {canCancel && <Button variant="outline" onClick={() => setConfirmAction("cancel")}><XCircle className="mr-1.5 h-4 w-4" /> Cancel</Button>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">From</div><div className="font-medium">{order.src?.name}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">To</div><div className="font-medium">{order.dst?.name}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Date</div><div className="font-medium">{formatDate(order.transfer_date)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Status</div><div className="font-medium capitalize">{order.status}</div></Card>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Shipped</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.items?.name}</TableCell>
                    <TableCell className="text-muted-foreground">{l.items?.sku ?? ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.quantity_requested)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.quantity_shipped)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.quantity_received)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(l.quantity_requested) - Number(l.quantity_received)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="p-4">
            <ol className="relative ml-3 border-l pl-6 space-y-4">
              <TimelineRow label="Created" at={order.created_at} />
              {order.approved_by && <TimelineRow label="Confirmed" at={order.updated_at} />}
              {order.shipped_at && <TimelineRow label="Shipped" at={order.shipped_at} />}
              {order.received_at && <TimelineRow label="Received" at={order.received_at} />}
              {order.status === "completed" && <TimelineRow label="Completed" at={order.updated_at} />}
              {order.status === "cancelled" && <TimelineRow label="Cancelled" at={order.updated_at} />}
            </ol>
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">Inventory Transactions</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!txs.length ? (
                    <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No movements yet.</TableCell></TableRow>
                  ) : txs.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                      <TableCell><Badge variant="outline">{t.transaction_type}</Badge></TableCell>
                      <TableCell>{t.wh?.name}</TableCell>
                      <TableCell>{t.items?.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(t.quantity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="overview">
          <Card className="p-4 space-y-2 text-sm">
            <div><span className="text-muted-foreground">Notes: </span>{order.notes || "—"}</div>
            <div><span className="text-muted-foreground">Created: </span>{formatDate(order.created_at)}</div>
            <div><span className="text-muted-foreground">Last updated: </span>{formatDate(order.updated_at)}</div>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmAction !== null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="capitalize">{confirmAction} Transfer Order?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "confirm" && "This will reserve the requested stock at the source warehouse."}
              {confirmAction === "ship" && "This will deduct stock from the source warehouse and mark it as in-transit."}
              {confirmAction === "receive" && "This will add the shipped stock to the destination warehouse."}
              {confirmAction === "cancel" && "Reservations will be released and any in-transit stock returned to source."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmed} className="bg-emerald-600 hover:bg-emerald-700">Proceed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TimelineRow({ label, at }: { label: string; at?: string | null }) {
  return (
    <li className="relative">
      <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{at ? formatDate(at) : ""}</p>
    </li>
  );
}
