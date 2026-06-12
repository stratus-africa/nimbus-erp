import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { Plus, Search, RefreshCw, Boxes } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { calculateCompositeAvailability } from "@/lib/composite-utils";

export const Route = createFileRoute("/_authenticated/composite-items")({
  head: () => ({ meta: [{ title: "Composite Items — Nimbus ERP" }] }),
  component: CompositeItemsPage,
});

function CompositeItemsPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["composite-items", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("composite_items")
        .select(
          "id, composite_type, status, description, created_at, parent_item_id, items:parent_item_id(id, name, sku, selling_price), composite_item_components(quantity, items:component_item_id(stock_on_hand))",
        )
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r: any) =>
      [r.items?.name, r.items?.sku, r.description]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  return (
    <div className="-m-6">
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => qc.invalidateQueries({ queryKey: ["composite-items"] })} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search composite items" className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background" />
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Composite Items</h1>
        </div>
        <Button onClick={() => navigate({ to: "/composite-items/new" })} className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4" /> New Composite Item
        </Button>
      </div>

      <div className="border-t bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6 uppercase text-xs tracking-wide">Name</TableHead>
              <TableHead className="uppercase text-xs tracking-wide">SKU</TableHead>
              <TableHead className="uppercase text-xs tracking-wide">Type</TableHead>
              <TableHead className="uppercase text-xs tracking-wide text-right">Selling Price</TableHead>
              <TableHead className="uppercase text-xs tracking-wide text-right">Components</TableHead>
              <TableHead className="uppercase text-xs tracking-wide text-right">Available</TableHead>
              <TableHead className="uppercase text-xs tracking-wide">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !filtered.length ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No composite items yet.</TableCell></TableRow>
            ) : filtered.map((c: any) => {
              const comps = (c.composite_item_components ?? []).map((cc: any) => ({
                quantity: Number(cc.quantity),
                stock_on_hand: Number(cc.items?.stock_on_hand ?? 0),
              }));
              const avail = calculateCompositeAvailability(comps);
              return (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <Link to="/composite-items/$id" params={{ id: c.id }} className="text-primary hover:underline">
                      {c.items?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.items?.sku ?? ""}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{c.composite_type}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{c.items?.selling_price ? formatCurrency(c.items.selling_price, currency) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.composite_item_components?.length ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{isFinite(avail) ? avail : "—"}</TableCell>
                  <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"} className="capitalize">{c.status}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
