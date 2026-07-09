import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Truck, X, Mail, FileText, MoreHorizontal, ChevronRight, MessageSquare, ExternalLink, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/packages_/$packageId")({
  head: () => ({ meta: [{ title: "Package — Nimbus ERP" }] }),
  component: PackageDetailPage,
});

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    delivered: "bg-emerald-100 text-emerald-700",
    in_transit: "bg-sky-100 text-sky-700",
    shipped: "bg-sky-100 text-sky-700",
    packed: "bg-amber-100 text-amber-700",
    not_shipped: "bg-red-100 text-red-700",
  };
  return map[s] ?? "bg-muted text-muted-foreground";
}

function PackageDetailPage() {
  const { packageId } = useParams({ from: "/_authenticated/packages_/$packageId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const { data: pkg, isLoading } = useQuery({
    queryKey: ["package-detail-v2", packageId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("packages")
        .select("*, locations:warehouse_id(name), tenants(name, address, tax_number, phone, email, logo_url)")
        .eq("id", packageId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["package-items-v2", packageId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("package_items")
        .select("*, items(name, sku, unit)")
        .eq("package_id", packageId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: salesOrder } = useQuery({
    enabled: !!pkg && pkg?.source_type === "sales_order",
    queryKey: ["package-so", pkg?.source_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sales_orders")
        .select("id, so_number, so_date, customers(id, name, company_name, billing_address, shipping_address, phone, vat_number)")
        .eq("id", pkg!.source_id)
        .maybeSingle();
      return data;
    },
  });

  const { data: shipmentLink } = useQuery({
    queryKey: ["package-shipment-v2", packageId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("shipment_packages")
        .select("shipment_id, shipments(id, shipment_number, status, carrier, tracking_number, tracking_url, shipment_date)")
        .eq("package_id", packageId)
        .maybeSingle();
      return data;
    },
  });
  const shipment = shipmentLink?.shipments;

  const createShipment = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("create_shipment_from_package", {
        _package_id: packageId,
        _carrier: carrier || null,
        _tracking: tracking || null,
        _tracking_url: trackingUrl || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (shpId) => {
      toast.success("Shipment created");
      setOpen(false);
      qc.invalidateQueries();
      navigate({ to: "/shipments/$shipmentId", params: { shipmentId: shpId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create shipment"),
  });

  const saveNotes = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("packages").update({ notes: notesDraft }).eq("id", packageId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notes saved");
      setNotesOpen(false);
      qc.invalidateQueries({ queryKey: ["package-detail-v2", packageId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!pkg) return <div className="p-6">Package not found.</div>;

  const tenant = pkg.tenants;
  const customer = salesOrder?.customers;
  const totalQty = (items ?? []).reduce((s: number, l: any) => s + Number(l.quantity ?? 0), 0);
  const displayStatus = shipment?.status ?? pkg.status;

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-3">
        <h1 className="text-lg font-semibold">{pkg.package_number}</h1>
        <div className="flex items-center gap-2">
          <button className="rounded p-1.5 text-muted-foreground hover:bg-muted"><MessageSquare className="h-4 w-4" /></button>
          <button onClick={() => navigate({ to: "/packages" })} className="rounded p-1.5 text-red-500 hover:bg-red-50">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 border-b bg-card px-6 py-2">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-sm">
          <Mail className="h-4 w-4" /> Send Email
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-sm">
          <FileText className="h-4 w-4" /> PDF/Print
          <ChevronRight className="h-3 w-3 rotate-90" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-4 p-6">
          {/* Associated sales orders */}
          {salesOrder && (
            <button
              onClick={() => navigate({ to: "/sales-orders/$soId", params: { soId: salesOrder.id } })}
              className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm hover:bg-muted/40"
            >
              <div>
                <span className="text-muted-foreground">Associated sales orders </span>
                <span className="font-semibold text-sky-600">1</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          {/* Shipment card */}
          {shipment && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-100">
                  <Truck className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Shipment Order#</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate({ to: "/shipments/$shipmentId", params: { shipmentId: shipment.id } })}
                      className="font-semibold text-sky-600 hover:underline"
                    >
                      {shipment.shipment_number}
                    </button>
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", statusBadge(shipment.status))}>
                      {shipment.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-y-2 border-t pt-3 text-sm">
                <div className="text-muted-foreground">Date of Shipment</div>
                <div>{shipment.shipment_date ? formatDate(shipment.shipment_date) : "—"}</div>
                <div className="text-muted-foreground">Carrier</div>
                <div>{shipment.carrier ?? "—"}</div>
                <div className="text-muted-foreground">Tracking#</div>
                <div className="font-mono text-xs">
                  {shipment.tracking_url ? (
                    <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline inline-flex items-center gap-1">
                      {shipment.tracking_number ?? "—"} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    shipment.tracking_number ?? "—"
                  )}
                </div>
              </div>
            </div>
          )}

          {!shipment && (
            <div className="flex items-center justify-between rounded-lg border border-dashed bg-card px-4 py-3 text-sm">
              <span className="text-muted-foreground">No shipment created for this package yet.</span>
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setOpen(true)}>
                <Truck className="mr-1.5 h-4 w-4" /> Create Shipment
              </Button>
            </div>
          )}

          {/* Package document */}
          <div className="relative overflow-hidden rounded-lg border bg-white shadow-sm">
            {/* Corner ribbon */}
            <div className="pointer-events-none absolute -left-10 top-4 z-10 w-40 -rotate-45 bg-emerald-500 py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-white shadow">
              {displayStatus.replace("_", " ")}
            </div>

            <div className="p-10 text-[13px] leading-relaxed text-gray-800">
              {/* Header */}
              <div className="mb-8 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {tenant?.logo_url ? (
                    <img src={tenant.logo_url} alt="" className="h-14 max-w-[160px] object-contain" />
                  ) : (
                    <div className="text-lg font-semibold">{tenant?.name ?? ""}</div>
                  )}
                  <div className="mt-1 text-xs">
                    {tenant?.name && !tenant?.logo_url ? null : <div className="font-semibold">{tenant?.name}</div>}
                    {tenant?.address && (
                      <div className="whitespace-pre-line text-gray-600">{tenant.address}</div>
                    )}
                    {tenant?.tax_number && <div className="mt-2 text-gray-600">PIN {tenant.tax_number}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-light text-gray-700">Package</div>
                  <div className="mt-1 text-xs text-gray-600">Package# {pkg.package_number}</div>
                </div>
              </div>

              {/* Meta */}
              <div className="mb-6 grid grid-cols-5 gap-4 border-y py-4 text-xs">
                <div>
                  <div className="font-semibold">Package#</div>
                  <div className="text-gray-600">{pkg.package_number}</div>
                </div>
                <div>
                  <div className="font-semibold">Order Date</div>
                  <div className="text-gray-600">{salesOrder?.so_date ? formatDate(salesOrder.so_date) : "—"}</div>
                </div>
                <div>
                  <div className="font-semibold">Package Date</div>
                  <div className="text-gray-600">{formatDate(pkg.package_date)}</div>
                </div>
                <div>
                  <div className="font-semibold">Sales Order#</div>
                  <div className="text-gray-600">{salesOrder?.so_number ?? "—"}</div>
                </div>
                <div className="rounded bg-gray-100 px-3 py-1">
                  <div className="font-semibold">Total Qty</div>
                  <div className="text-lg font-semibold">{totalQty.toFixed(2)}</div>
                </div>
              </div>

              {/* Bill To / Ship To */}
              {customer && (
                <div className="mb-8 grid grid-cols-2 gap-8 text-xs">
                  <div>
                    <div className="mb-1 font-semibold">Bill To</div>
                    <div className="text-sky-600">{customer.company_name ?? customer.name}</div>
                    {customer.billing_address && (
                      <div className="whitespace-pre-line text-gray-600">{customer.billing_address}</div>
                    )}
                    {customer.vat_number && <div className="mt-2 text-gray-600">{customer.vat_number}</div>}
                  </div>
                  <div>
                    <div className="mb-1 font-semibold">Ship To</div>
                    <div>{customer.company_name ?? customer.name}</div>
                    {customer.shipping_address && (
                      <div className="whitespace-pre-line text-gray-600">{customer.shipping_address}</div>
                    )}
                    {customer.vat_number && <div className="mt-2 text-gray-600">{customer.vat_number}</div>}
                    {customer.phone && <div className="mt-1 text-gray-600">{customer.phone}</div>}
                  </div>
                </div>
              )}

              {/* Items */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Item & Description</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(items ?? []).map((l: any, i: number) => (
                    <tr key={l.id} className="border-b">
                      <td className="px-3 py-3 align-top">{i + 1}</td>
                      <td className="px-3 py-3 align-top">
                        <div>{l.items?.name ?? "—"}</div>
                        {l.description && l.description !== l.items?.name && (
                          <div className="text-gray-500">{l.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right align-top tabular-nums">
                        {Number(l.quantity).toFixed(2)}
                        <div className="text-[10px] text-gray-500">{l.items?.unit ?? "pcs"}</div>
                      </td>
                    </tr>
                  ))}
                  {(items ?? []).length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">No items in this package.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t bg-gray-50 px-10 py-3 text-xs text-gray-600">
              PDF Template : 'Standard Template' <button className="ml-2 text-sky-600 hover:underline">Change</button>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-semibold">Package Notes</div>
            {pkg.notes ? (
              <div className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{pkg.notes}</div>
            ) : null}
            <button
              onClick={() => { setNotesDraft(pkg.notes ?? ""); setNotesOpen(true); }}
              className="mt-2 text-sm text-sky-600 hover:underline"
            >
              {pkg.notes ? "Edit Notes" : "Add Notes"}
            </button>
          </div>
        </div>
      </div>

      {/* Create Shipment dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Shipment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Carrier</Label><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} /></div>
            <div><Label>Tracking Number</Label><Input value={tracking} onChange={(e) => setTracking(e.target.value)} /></div>
            <div><Label>Tracking URL</Label><Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createShipment.mutate()} disabled={createShipment.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes dialog */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Package Notes</DialogTitle></DialogHeader>
          <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={5} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesOpen(false)}>Cancel</Button>
            <Button onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
