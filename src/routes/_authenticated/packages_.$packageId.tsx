import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Truck, ArrowLeft, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/packages_/$packageId")({
  head: () => ({ meta: [{ title: "Package — Nimbus ERP" }] }),
  component: PackageDetailPage,
});

function PackageDetailPage() {
  const { packageId } = useParams({ from: "/_authenticated/packages_/$packageId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const { data: pkg, isLoading } = useQuery({
    queryKey: ["package-detail", packageId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("packages")
        .select("*, locations:warehouse_id(name)")
        .eq("id", packageId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["package-items", packageId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("package_items")
        .select("*, items(name, sku)")
        .eq("package_id", packageId).order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: shipment } = useQuery({
    queryKey: ["package-shipment", packageId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("shipment_packages")
        .select("shipment_id, shipments(id, shipment_number, status)")
        .eq("package_id", packageId).maybeSingle();
      return data;
    },
  });

  const createShipment = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("create_shipment_from_package", {
        _package_id: packageId, _carrier: carrier || null,
        _tracking: tracking || null, _tracking_url: trackingUrl || null,
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

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!pkg) return <div className="p-6">Package not found.</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/packages" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{pkg.package_number}</h1>
            <div className="text-xs text-muted-foreground">
              {formatDate(pkg.package_date)} · {pkg.locations?.name ?? "—"} · <span className="uppercase">{pkg.status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {shipment?.shipments ? (
            <Button variant="outline" size="sm"
              onClick={() => navigate({ to: "/shipments/$shipmentId", params: { shipmentId: shipment.shipment_id } })}>
              <ExternalLink className="mr-1.5 h-4 w-4" /> View Shipment {shipment.shipments.shipment_number}
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setOpen(true)}>
              <Truck className="mr-1.5 h-4 w-4" /> Create Shipment
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Item</th>
                <th className="px-4 py-2.5 text-left font-medium">Description</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((l: any) => (
                <tr key={l.id} className="border-b">
                  <td className="px-4 py-3 font-medium">{l.items?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.description ?? l.items?.sku ?? ""}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(l.quantity).toFixed(2)}</td>
                </tr>
              ))}
              {(items ?? []).length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No items in this package.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Shipment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Carrier</Label><Input value={carrier} onChange={e => setCarrier(e.target.value)} /></div>
            <div><Label>Tracking Number</Label><Input value={tracking} onChange={e => setTracking(e.target.value)} /></div>
            <div><Label>Tracking URL</Label><Input value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createShipment.mutate()} disabled={createShipment.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
