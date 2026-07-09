import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Package, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shipments_/$shipmentId")({
  head: () => ({ meta: [{ title: "Shipment — Nimbus ERP" }] }),
  component: ShipmentDetailPage,
});

function ShipmentDetailPage() {
  const { shipmentId } = useParams({ from: "/_authenticated/shipments_/$shipmentId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: shp } = useQuery({
    queryKey: ["shipment-detail", shipmentId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("shipments").select("*").eq("id", shipmentId).maybeSingle();
      return data;
    },
  });

  const { data: pkgs } = useQuery({
    queryKey: ["shipment-packages", shipmentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shipment_packages")
        .select("id, packages(id, package_number, package_date, status, source_type, source_id)")
        .eq("shipment_id", shipmentId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: available } = useQuery({
    enabled: open && !!tenantId,
    queryKey: ["shipment-attach-candidates", tenantId, shipmentId],
    queryFn: async () => {
      const { data: assigned } = await (supabase as any)
        .from("shipment_packages").select("package_id");
      const assignedIds = new Set((assigned ?? []).map((r: any) => r.package_id));
      const { data } = await (supabase as any)
        .from("packages").select("id, package_number, package_date, status")
        .eq("tenant_id", tenantId!).order("created_at", { ascending: false }).limit(200);
      return (data ?? []).filter((p: any) => !assignedIds.has(p.id));
    },
  });

  const attach = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (!ids.length) return;
      const { error } = await (supabase as any).rpc("attach_packages_to_shipment", {
        _shipment_id: shipmentId, _package_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Packages attached");
      setOpen(false); setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["shipment-packages"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  if (!shp) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/shipments" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{shp.shipment_number}</h1>
            <div className="text-xs text-muted-foreground">
              {shp.carrier ?? "—"} · {shp.tracking_number ?? "no tracking"} · <span className="uppercase">{shp.status}</span>
            </div>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Plus className="mr-1.5 h-4 w-4" /> Attach Packages
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">Packages on this shipment</div>
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Package #</th>
                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                <th className="px-4 py-2.5 text-left font-medium">Source</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(pkgs ?? []).map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/40 cursor-pointer"
                  onClick={() => navigate({ to: "/packages/$packageId", params: { packageId: r.packages.id } })}>
                  <td className="px-4 py-3 font-medium text-sky-600">{r.packages.package_number}</td>
                  <td className="px-4 py-3">{formatDate(r.packages.package_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.packages.source_type}</td>
                  <td className="px-4 py-3 text-xs font-semibold uppercase">{r.packages.status}</td>
                </tr>
              ))}
              {(pkgs ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 h-6 w-6 opacity-40" />No packages attached.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Attach Packages</DialogTitle></DialogHeader>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 sticky top-0">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2 text-left text-xs font-medium">Package #</th>
                  <th className="px-3 py-2 text-left text-xs font-medium">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(available ?? []).map((p: any) => (
                  <tr key={p.id} className="border-b">
                    <td className="px-3 py-2">
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    </td>
                    <td className="px-3 py-2 font-medium">{p.package_number}</td>
                    <td className="px-3 py-2">{formatDate(p.package_date)}</td>
                    <td className="px-3 py-2 text-xs uppercase">{p.status}</td>
                  </tr>
                ))}
                {(available ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No unassigned packages.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => attach.mutate()} disabled={!selected.size || attach.isPending}>
              Attach {selected.size || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
