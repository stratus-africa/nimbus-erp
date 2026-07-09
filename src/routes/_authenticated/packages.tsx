import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Search, ChevronDown, MoreHorizontal, List, Columns } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/packages")({
  head: () => ({ meta: [{ title: "Packages — Nimbus ERP" }] }),
  component: PackagesListPage,
});

type Row = {
  id: string;
  package_number: string;
  package_date: string;
  status: string;
  source_type: string;
  source_id: string;
  so_number: string | null;
  customer_name: string | null;
  quantity: number;
  carrier: string | null;
  tracking_number: string | null;
  shipment_date: string | null;
  shipment_status: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  delivered: "text-emerald-600",
  shipped: "text-sky-600",
  in_transit: "text-sky-600",
  not_shipped: "text-red-500",
  packed: "text-amber-600",
};

function StatusPill({ shipmentStatus, packageStatus }: { shipmentStatus: string | null; packageStatus: string }) {
  const label = shipmentStatus
    ? shipmentStatus === "delivered"
      ? "DELIVERED"
      : shipmentStatus === "in_transit" || shipmentStatus === "shipped"
        ? "SHIPPED"
        : shipmentStatus.toUpperCase()
    : "NOT SHIPPED";
  const key = shipmentStatus ?? "not_shipped";
  return (
    <span className={cn("text-xs font-semibold tracking-wide", STATUS_STYLES[key] ?? "text-muted-foreground")}>
      {label}
    </span>
  );
}

function PackagesListPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["packages-list-v2", tenantId],
    queryFn: async (): Promise<Row[]> => {
      const { data: pkgs, error } = await (supabase as any)
        .from("packages")
        .select("id, package_number, package_date, status, source_type, source_id")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const packages = pkgs ?? [];
      if (!packages.length) return [];

      const pkgIds = packages.map((p: any) => p.id);
      const soIds = Array.from(
        new Set(packages.filter((p: any) => p.source_type === "sales_order").map((p: any) => p.source_id)),
      );

      const [itemsRes, shipLinksRes, soRes] = await Promise.all([
        (supabase as any).from("package_items").select("package_id, quantity").in("package_id", pkgIds),
        (supabase as any)
          .from("shipment_packages")
          .select("package_id, shipments(carrier, tracking_number, shipment_date, status)")
          .in("package_id", pkgIds),
        soIds.length
          ? (supabase as any)
              .from("sales_orders")
              .select("id, so_number, customers(name, company_name)")
              .in("id", soIds)
          : Promise.resolve({ data: [] }),
      ]);

      const qtyByPkg = new Map<string, number>();
      for (const r of itemsRes.data ?? []) {
        qtyByPkg.set(r.package_id, (qtyByPkg.get(r.package_id) ?? 0) + Number(r.quantity ?? 0));
      }
      const shipByPkg = new Map<string, any>();
      for (const r of shipLinksRes.data ?? []) shipByPkg.set(r.package_id, r.shipments);
      const soById = new Map<string, any>();
      for (const r of soRes.data ?? []) soById.set(r.id, r);

      return packages.map((p: any): Row => {
        const so = p.source_type === "sales_order" ? soById.get(p.source_id) : null;
        const ship = shipByPkg.get(p.id);
        return {
          id: p.id,
          package_number: p.package_number,
          package_date: p.package_date,
          status: p.status,
          source_type: p.source_type,
          source_id: p.source_id,
          so_number: so?.so_number ?? null,
          customer_name: so?.customers?.company_name ?? so?.customers?.name ?? null,
          quantity: qtyByPkg.get(p.id) ?? 0,
          carrier: ship?.carrier ?? null,
          tracking_number: ship?.tracking_number ?? null,
          shipment_date: ship?.shipment_date ?? null,
          shipment_status: ship?.status ?? null,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter(
      (r) =>
        r.package_number.toLowerCase().includes(q) ||
        r.so_number?.toLowerCase().includes(q) ||
        r.customer_name?.toLowerCase().includes(q) ||
        r.tracking_number?.toLowerCase().includes(q) ||
        r.carrier?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-card px-5 py-3">
        <button className="flex items-center gap-1.5 text-lg font-semibold hover:text-foreground/80">
          All Packages <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <button className="bg-muted p-1.5 text-foreground"><List className="h-4 w-4" /></button>
            <button className="p-1.5 text-muted-foreground hover:bg-muted/50"><Columns className="h-4 w-4" /></button>
          </div>
          <Button size="sm" className="bg-orange-500 text-white hover:bg-orange-600">+ New</Button>
          <Button size="icon" variant="outline" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b bg-card/50 px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search packages…"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-muted/30 backdrop-blur">
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2.5"><input type="checkbox" className="rounded" /></th>
              <th className="px-3 py-2.5 text-left font-medium">Package Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Package#</th>
              <th className="px-3 py-2.5 text-left font-medium">Carrier</th>
              <th className="px-3 py-2.5 text-left font-medium">Tracking#</th>
              <th className="px-3 py-2.5 text-left font-medium">Sales Order#</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-left font-medium">Shipment Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Customer Name</th>
              <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-16 text-center text-muted-foreground">
                <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                No packages found.
              </td></tr>
            ) : filtered.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer border-b hover:bg-muted/40"
                onClick={() => navigate({ to: "/packages/$packageId", params: { packageId: r.id } })}
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="rounded" />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDate(r.package_date)}</td>
                <td className="px-3 py-3 font-medium text-sky-600">{r.package_number}</td>
                <td className="px-3 py-3">{r.carrier ?? ""}</td>
                <td className="px-3 py-3 font-mono text-xs">{r.tracking_number ?? ""}</td>
                <td className="px-3 py-3">{r.so_number ?? ""}</td>
                <td className="px-3 py-3">
                  <StatusPill shipmentStatus={r.shipment_status} packageStatus={r.status} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {r.shipment_date ? formatDate(r.shipment_date) : ""}
                </td>
                <td className="px-3 py-3">{r.customer_name ?? ""}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.quantity.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
