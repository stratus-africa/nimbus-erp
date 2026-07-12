import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { formatDate } from "@/lib/format";
import { Truck, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewShipmentDialog } from "@/components/shipments/new-shipment-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shipments")({
  head: () => ({ meta: [{ title: "Shipments — Nimbus ERP" }] }),
  component: ShipmentsListPage,
});

function ShipmentsListPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["shipments-list", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shipments")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("shipment_packages").delete().eq("shipment_id", id);
      const { error } = await (supabase as any).from("shipments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shipment deleted");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["shipments-list"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-card px-5 py-3">
        <h1 className="text-lg font-semibold">Shipments</h1>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => setNewOpen(true)}
        >
          <Plus className="h-4 w-4" /> New Shipment
        </Button>
      </div>
      <NewShipmentDialog open={newOpen} onOpenChange={setNewOpen} />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-card">
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-left font-medium">Shipment #</th>
              <th className="px-4 py-2.5 text-left font-medium">Carrier</th>
              <th className="px-4 py-2.5 text-left font-medium">Tracking</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="w-10 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : (rows ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                <Truck className="mx-auto mb-2 h-6 w-6 opacity-40" />No shipments yet.
              </td></tr>
            ) : rows!.map((r: any) => (
              <tr key={r.id} className="border-b hover:bg-muted/40 cursor-pointer"
                onClick={() => navigate({ to: "/shipments/$shipmentId", params: { shipmentId: r.id } })}>
                <td className="px-4 py-3">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 font-medium text-sky-600">{r.shipment_number}</td>
                <td className="px-4 py-3">{r.carrier ?? "—"}</td>
                <td className="px-4 py-3">{r.tracking_number ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-semibold uppercase">{r.status}</td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate({ to: "/shipments/$shipmentId", params: { shipmentId: r.id } })}>
                        <Pencil className="mr-2 h-4 w-4" /> Open / Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shipment?</AlertDialogTitle>
            <AlertDialogDescription>The shipment record and its package links will be removed. The packages themselves will remain.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && del.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
