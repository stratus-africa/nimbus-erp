import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/packages")({
  head: () => ({ meta: [{ title: "Packages — Nimbus ERP" }] }),
  component: PackagesListPage,
});

function PackagesListPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["packages-list", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("packages")
        .select("*, locations:warehouse_id(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-card px-5 py-3">
        <h1 className="text-lg font-semibold">Packages</h1>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-card">
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-left font-medium">Package #</th>
              <th className="px-4 py-2.5 text-left font-medium">Source</th>
              <th className="px-4 py-2.5 text-left font-medium">Warehouse</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : (rows ?? []).length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                <Package className="mx-auto mb-2 h-6 w-6 opacity-40" />
                No packages yet. Create one from a sales order.
              </td></tr>
            ) : rows!.map((r: any) => (
              <tr key={r.id} className="border-b hover:bg-muted/40 cursor-pointer"
                onClick={() => navigate({ to: "/packages/$packageId", params: { packageId: r.id } })}>
                <td className="px-4 py-3">{formatDate(r.package_date)}</td>
                <td className="px-4 py-3 font-medium text-sky-600">{r.package_number}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.source_type}</td>
                <td className="px-4 py-3">{r.locations?.name ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-semibold uppercase">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
