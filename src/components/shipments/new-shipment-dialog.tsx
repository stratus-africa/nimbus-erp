import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { Search, Package as PackageIcon } from "lucide-react";

/**
 * Creates a single shipment from one or more packages that are not yet
 * attached to any shipment. Uses the `create_shipment_from_packages` RPC.
 */
export function NewShipmentDialog({
  open,
  onOpenChange,
  initialPackageIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPackageIds?: string[];
}) {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialPackageIds ?? []),
  );
  const [search, setSearch] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const { data: pkgs, isLoading } = useQuery({
    enabled: open && !!tenantId,
    queryKey: ["unshipped-packages", tenantId],
    queryFn: async () => {
      // Packages in this tenant that are NOT already on a shipment.
      const [pkgsRes, spRes] = await Promise.all([
        (supabase as any)
          .from("packages")
          .select(
            "id, package_number, package_date, status, source_type, source_id",
          )
          .eq("tenant_id", tenantId!)
          .neq("status", "delivered")
          .order("package_date", { ascending: false })
          .limit(500),
        (supabase as any).from("shipment_packages").select("package_id"),
      ]);
      const attached = new Set(
        (spRes.data ?? []).map((r: any) => r.package_id as string),
      );
      const rows = (pkgsRes.data ?? []).filter((p: any) => !attached.has(p.id));

      // Look up SO / customer info for source_type = sales_order
      const soIds = Array.from(
        new Set(
          rows
            .filter((r: any) => r.source_type === "sales_order")
            .map((r: any) => r.source_id),
        ),
      );
      const soById = new Map<string, any>();
      if (soIds.length) {
        const { data } = await (supabase as any)
          .from("sales_orders")
          .select("id, so_number, customers(name, company_name)")
          .in("id", soIds);
        for (const s of data ?? []) soById.set(s.id, s);
      }
      return rows.map((r: any) => {
        const so = r.source_type === "sales_order" ? soById.get(r.source_id) : null;
        return {
          ...r,
          so_number: so?.so_number ?? null,
          customer_name:
            so?.customers?.company_name ?? so?.customers?.name ?? null,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pkgs ?? [];
    return (pkgs ?? []).filter(
      (r: any) =>
        r.package_number?.toLowerCase().includes(q) ||
        r.so_number?.toLowerCase().includes(q) ||
        r.customer_name?.toLowerCase().includes(q),
    );
  }, [pkgs, search]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const create = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (!ids.length) throw new Error("Select at least one package");
      const { data, error } = await (supabase as any).rpc(
        "create_shipment_from_packages",
        {
          _package_ids: ids,
          _carrier: carrier || null,
          _tracking: tracking || null,
          _tracking_url: trackingUrl || null,
        },
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: (shipmentId) => {
      toast.success(`Shipment created with ${selected.size} package(s)`);
      qc.invalidateQueries();
      onOpenChange(false);
      setSelected(new Set());
      setCarrier("");
      setTracking("");
      setTrackingUrl("");
      navigate({ to: "/shipments/$shipmentId", params: { shipmentId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create shipment"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Shipment</DialogTitle>
          <DialogDescription>
            Select one or more packages to include in this shipment. Packages
            already assigned to a shipment are not shown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packages, SO#, customer…"
              className="pl-8 h-9"
            />
          </div>

          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 p-2"></th>
                  <th className="px-3 py-2 text-left font-medium">Package #</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Sales Order</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      <PackageIcon className="mx-auto mb-2 h-6 w-6 opacity-40" />
                      No unshipped packages available.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r: any) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b hover:bg-muted/30"
                      onClick={() => toggle(r.id)}
                    >
                      <td className="p-2">
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-sky-600">
                        {r.package_number}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(r.package_date)}
                      </td>
                      <td className="px-3 py-2">{r.so_number ?? "—"}</td>
                      <td className="px-3 py-2">{r.customer_name ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Carrier</Label>
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="DHL, FedEx…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tracking #</Label>
              <Input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tracking URL</Label>
              <Input
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="mr-auto text-xs text-muted-foreground">
            {selected.size} selected
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!selected.size || create.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {create.isPending ? "Creating…" : "Create Shipment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
