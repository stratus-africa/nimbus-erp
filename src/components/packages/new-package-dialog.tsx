import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export function NewPackageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [soId, setSoId] = useState<string>("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [createShip, setCreateShip] = useState(false);

  const { data: sos } = useQuery({
    enabled: open && !!tenantId,
    queryKey: ["new-package-sos", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sales_orders")
        .select("id, so_number, so_date, customers(name, company_name)")
        .eq("tenant_id", tenantId!)
        .in("status", ["confirmed", "sent", "partially_invoiced"])
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!soId) throw new Error("Select a sales order");
      const { data: pkgId, error } = await (supabase as any).rpc("create_package_from_sales_order", { _so_id: soId });
      if (error) throw error;
      if (createShip) {
        const { error: se } = await (supabase as any).rpc("create_shipment_from_package", {
          _package_id: pkgId,
          _carrier: carrier || null,
          _tracking: tracking || null,
          _tracking_url: trackingUrl || null,
        });
        if (se) throw se;
      }
      return pkgId as string;
    },
    onSuccess: (pkgId) => {
      toast.success("Package created");
      qc.invalidateQueries();
      onOpenChange(false);
      setSoId(""); setCarrier(""); setTracking(""); setTrackingUrl(""); setCreateShip(false);
      navigate({ to: "/packages/$packageId", params: { packageId: pkgId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create package"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Package</DialogTitle>
          <DialogDescription>Create a package from a confirmed sales order.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Sales Order *</Label>
            <Select value={soId} onValueChange={setSoId}>
              <SelectTrigger><SelectValue placeholder="Select a sales order…" /></SelectTrigger>
              <SelectContent>
                {(sos ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.so_number} — {s.customers?.company_name ?? s.customers?.name ?? "—"}
                  </SelectItem>
                ))}
                {(sos ?? []).length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No confirmed sales orders available.</div>}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={createShip} onChange={(e) => setCreateShip(e.target.checked)} />
            Also create a shipment with tracking
          </label>
          {createShip && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1.5"><Label>Carrier</Label><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="DHL, FedEx…" /></div>
              <div className="space-y-1.5"><Label>Tracking Number</Label><Input value={tracking} onChange={(e) => setTracking(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tracking URL</Label><Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://…" /></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!soId || create.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {create.isPending ? "Creating…" : "Create Package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
