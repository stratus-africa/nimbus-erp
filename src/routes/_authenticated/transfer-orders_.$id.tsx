import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle2, Truck, PackageCheck, XCircle, Send, ThumbsDown, Package } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { useState } from "react";
import { useTransferPermissions } from "@/hooks/use-transfer-permissions";

export const Route = createFileRoute("/_authenticated/transfer-orders_/$id")({
  head: () => ({ meta: [{ title: "Transfer Order — Nimbus ERP" }] }),
  component: TransferOrderDetail,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", pending_approval: "outline", confirmed: "outline", shipped: "outline",
  received: "outline", completed: "default", cancelled: "destructive", rejected: "destructive",
};

function TransferOrderDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useTransferPermissions();
  const [confirmAction, setConfirmAction] = useState<null | "confirm" | "receive" | "cancel">(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [note, setNote] = useState("");
  const [ship, setShip] = useState({ carrier: "", tracking_number: "", tracking_url: "", create_package: true });

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

  const { data: approvals = [] } = useQuery({
    queryKey: ["transfer-approvals", id],
    queryFn: async () => {
      const { data } = await supabase.from("transfer_order_approvals" as any)
        .select("*").eq("transfer_order_id", id).order("created_at", { ascending: true });
      return (data as any) ?? [];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["transfer-packages", id],
    queryFn: async () => {
      const { data } = await supabase.from("packages" as any)
        .select("*").eq("source_type", "transfer_orders").eq("source_id", id)
        .order("created_at", { ascending: false });
      return (data as any) ?? [];
    },
  });

  const { data: shipments = [] } = useQuery({
    queryKey: ["transfer-shipments", id],
    queryFn: async () => {
      const { data } = await supabase.from("shipments" as any)
        .select("*").eq("source_type", "transfer_orders").eq("source_id", id)
        .order("created_at", { ascending: false });
      return (data as any) ?? [];
    },
  });

  if (!order) return <div className="text-muted-foreground">Loading…</div>;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["transfer-order", id] });
    qc.invalidateQueries({ queryKey: ["transfer-tx", id] });
    qc.invalidateQueries({ queryKey: ["transfer-approvals", id] });
    qc.invalidateQueries({ queryKey: ["transfer-packages", id] });
    qc.invalidateQueries({ queryKey: ["transfer-shipments", id] });
    qc.invalidateQueries({ queryKey: ["transfer-orders"] });
  };

  const callRpc = async (name: string, args: any = { _id: id }) => {
    const { error } = await supabase.rpc(name as any, args);
    if (error) return toast.error(error.message);
    toast.success("Done");
    invalidateAll();
  };

  const runConfirmed = () => {
    if (!confirmAction) return;
    const map = { confirm: "confirm_transfer_order", receive: "receive_transfer_order", cancel: "cancel_transfer_order" };
    callRpc(map[confirmAction]);
    setConfirmAction(null);
  };

  const lines = order.transfer_order_items ?? [];

  const isDraft = order.status === "draft";
  const isPending = order.status === "pending_approval";
  const canShipMore = (order.status === "confirmed" || order.status === "shipped") && lines.some((l: any) => l.quantity_shipped < l.quantity_requested);
  const canReceiveMore = (order.status === "shipped" || order.status === "received") && lines.some((l: any) => l.quantity_received < l.quantity_shipped);
  const canCancelStatus = !["completed", "cancelled", "rejected"].includes(order.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/transfer-orders" })}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-semibold">{order.transfer_number}</h1>
          <Badge variant={STATUS_VARIANT[order.status] ?? "secondary"} className="capitalize">{order.status.replace("_", " ")}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && can("request") && (
            <Button variant="outline" onClick={() => setRequestOpen(true)}><Send className="mr-1.5 h-4 w-4" /> Request Approval</Button>
          )}
          {isDraft && can("confirm") && (
            <Button onClick={() => setConfirmAction("confirm")} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1.5 h-4 w-4" /> Confirm</Button>
          )}
          {isPending && can("approve") && (
            <>
              <Button onClick={() => setApproveOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve</Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)}><ThumbsDown className="mr-1.5 h-4 w-4" /> Reject</Button>
            </>
          )}
          {canShipMore && can("ship") && (
            <Button onClick={() => setShipOpen(true)} className="bg-blue-600 hover:bg-blue-700"><Truck className="mr-1.5 h-4 w-4" /> Ship</Button>
          )}
          {canReceiveMore && can("receive") && (
            <Button onClick={() => setConfirmAction("receive")} className="bg-emerald-600 hover:bg-emerald-700"><PackageCheck className="mr-1.5 h-4 w-4" /> Receive</Button>
          )}
          {canCancelStatus && can("cancel") && (
            <Button variant="outline" onClick={() => setConfirmAction("cancel")}><XCircle className="mr-1.5 h-4 w-4" /> Cancel</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">From</div><div className="font-medium">{order.src?.name}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">To</div><div className="font-medium">{order.dst?.name}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Date</div><div className="font-medium">{formatDate(order.transfer_date)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Tracking</div><div className="font-medium truncate">{order.tracking_number || "—"}</div>{order.carrier && <div className="text-xs text-muted-foreground">{order.carrier}</div>}</Card>
      </div>

      {order.status === "rejected" && order.rejection_reason && (
        <Card className="p-4 border-destructive bg-destructive/5">
          <div className="text-xs font-semibold text-destructive">Rejected</div>
          <div className="text-sm">{order.rejection_reason}</div>
        </Card>
      )}

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="shipping">Packages & Shipments</TabsTrigger>
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
              {approvals.map((a: any) => (
                <TimelineRow key={a.id}
                  label={`${a.action[0].toUpperCase() + a.action.slice(1)} by ${a.actor_name || "—"}`}
                  at={a.created_at} note={a.comments} />
              ))}
            </ol>
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">Inventory Transactions</h3>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Warehouse</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Quantity</TableHead>
                </TableRow></TableHeader>
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

        <TabsContent value="shipping">
          <Card className="p-4 space-y-6">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4" /> Packages</h3>
              {!packages.length ? <div className="text-sm text-muted-foreground">No packages yet.</div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Package #</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{packages.map((p: any) => (
                    <TableRow key={p.id}><TableCell>{p.package_number}</TableCell><TableCell>{formatDate(p.package_date)}</TableCell><TableCell><Badge variant="outline" className="capitalize">{p.status}</Badge></TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4" /> Shipments</h3>
              {!shipments.length ? <div className="text-sm text-muted-foreground">No shipments yet.</div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Shipment #</TableHead><TableHead>Carrier</TableHead><TableHead>Tracking</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{shipments.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.shipment_number}</TableCell>
                      <TableCell>{s.carrier || "—"}</TableCell>
                      <TableCell>{s.tracking_url ? <a className="text-primary underline" href={s.tracking_url} target="_blank" rel="noreferrer">{s.tracking_number || "Track"}</a> : (s.tracking_number || "—")}</TableCell>
                      <TableCell>{formatDate(s.shipment_date)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{s.status.replace("_"," ")}</Badge></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
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

      {/* Request approval */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Approval</DialogTitle></DialogHeader>
          <Textarea placeholder="Optional note for the approver" value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await callRpc("request_transfer_approval", { _id: id, _note: note || null }); setNote(""); setRequestOpen(false); }}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Transfer Order</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Stock at the source warehouse will be reserved.</p>
          <Textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={async () => { await callRpc("approve_transfer_order", { _id: id, _note: note || null }); setNote(""); setApproveOpen(false); }}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Transfer Order</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason (required)" value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!note.trim()} onClick={async () => { await callRpc("reject_transfer_order", { _id: id, _reason: note }); setNote(""); setRejectOpen(false); }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ship */}
      <Dialog open={shipOpen} onOpenChange={setShipOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ship Transfer Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Carrier</Label><Input value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} placeholder="DHL, FedEx, Internal…" /></div>
            <div><Label>Tracking Number</Label><Input value={ship.tracking_number} onChange={(e) => setShip({ ...ship, tracking_number: e.target.value })} /></div>
            <div><Label>Tracking URL</Label><Input value={ship.tracking_url} onChange={(e) => setShip({ ...ship, tracking_url: e.target.value })} placeholder="https://…" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ship.create_package} onChange={(e) => setShip({ ...ship, create_package: e.target.checked })} /> Create package & shipment records</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={async () => {
              await callRpc("ship_transfer_order", { _id: id, _quantities: null, _carrier: ship.carrier || null, _tracking: ship.tracking_number || null, _tracking_url: ship.tracking_url || null, _create_package: ship.create_package });
              setShip({ carrier: "", tracking_number: "", tracking_url: "", create_package: true });
              setShipOpen(false);
            }}>Ship</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmAction !== null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="capitalize">{confirmAction} Transfer Order?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "confirm" && "This will reserve the requested stock at the source warehouse."}
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

function TimelineRow({ label, at, note }: { label: string; at?: string | null; note?: string | null }) {
  return (
    <li className="relative">
      <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{at ? formatDate(at) : ""}</p>
      {note && <p className="mt-0.5 text-xs italic text-muted-foreground">"{note}"</p>}
    </li>
  );
}
