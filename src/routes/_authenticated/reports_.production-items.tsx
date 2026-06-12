import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Boxes } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { calculateCompositeAvailability, calculateCompositeCost } from "@/lib/composite-utils";

export const Route = createFileRoute("/_authenticated/reports_/production-items")({
  head: () => ({ meta: [{ title: "Production Items Report — Nimbus ERP" }] }),
  component: ProductionItemsReport,
});

function ProductionItemsReport() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["production-items-report", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("composite_items")
        .select(
          "id, composite_type, status, items:parent_item_id(id, name, sku, selling_price), composite_item_components(quantity, unit_cost, items:component_item_id(id, name, sku, item_type, stock_on_hand))",
        )
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Aggregate component-level totals across all production items.
  const componentTotals = new Map<
    string,
    { name: string; sku: string; required: number; on_hand: number; item_type: string }
  >();
  (rows ?? []).forEach((p: any) => {
    (p.composite_item_components ?? []).forEach((c: any) => {
      const it = c.items;
      if (!it) return;
      const cur = componentTotals.get(it.id) ?? {
        name: it.name,
        sku: it.sku ?? "",
        required: 0,
        on_hand: Number(it.stock_on_hand ?? 0),
        item_type: it.item_type,
      };
      cur.required += Number(c.quantity);
      componentTotals.set(it.id, cur);
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Boxes className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Production Items Report</h1>
      </div>

      <Card>
        <div className="border-b p-4 font-semibold">Production Items — Component Breakdown</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Production Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Component</TableHead>
              <TableHead className="text-right">Qty / Build</TableHead>
              <TableHead className="text-right">On-hand</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Available Builds</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No production items.</TableCell></TableRow>
            ) : (
              rows.flatMap((p: any) => {
                const comps = p.composite_item_components ?? [];
                const avail = calculateCompositeAvailability(
                  comps.map((c: any) => ({
                    quantity: Number(c.quantity),
                    stock_on_hand: c.items?.item_type === "inventory" ? Number(c.items?.stock_on_hand ?? 0) : Infinity,
                  })),
                );
                const totalCost = calculateCompositeCost(
                  comps.map((c: any) => ({ component_item_id: c.items?.id, quantity: Number(c.quantity), unit_cost: Number(c.unit_cost) })),
                );
                if (!comps.length) {
                  return [(
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link to="/production-items/$id" params={{ id: p.id }} className="text-primary hover:underline">
                          {p.items?.name}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{p.composite_type}</Badge></TableCell>
                      <TableCell colSpan={6} className="text-muted-foreground">No components</TableCell>
                    </TableRow>
                  )];
                }
                return comps.map((c: any, idx: number) => (
                  <TableRow key={`${p.id}-${idx}`}>
                    {idx === 0 ? (
                      <>
                        <TableCell rowSpan={comps.length} className="align-top">
                          <Link to="/production-items/$id" params={{ id: p.id }} className="text-primary hover:underline font-medium">
                            {p.items?.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{p.items?.sku}</div>
                          <div className="text-xs text-muted-foreground">Total cost: {formatCurrency(totalCost, currency)}</div>
                        </TableCell>
                        <TableCell rowSpan={comps.length} className="align-top">
                          <Badge variant="outline" className="capitalize">{p.composite_type}</Badge>
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell>{c.items?.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(c.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.items?.item_type === "inventory" ? Number(c.items?.stock_on_hand ?? 0) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(c.unit_cost), currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(Number(c.quantity) * Number(c.unit_cost), currency)}
                    </TableCell>
                    {idx === 0 ? (
                      <TableCell rowSpan={comps.length} className="align-top text-right tabular-nums font-medium">
                        {isFinite(avail) ? avail : "—"}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ));
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="border-b p-4 font-semibold">Total Component Requirements (across all production items)</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Total Required / Build-set</TableHead>
              <TableHead className="text-right">On-hand</TableHead>
              <TableHead className="text-right">Net Impact</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {componentTotals.size === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No components.</TableCell></TableRow>
            ) : (
              Array.from(componentTotals.entries()).map(([id, c]) => {
                const net = c.item_type === "inventory" ? c.on_hand - c.required : null;
                const shortage = net !== null && net < 0;
                return (
                  <TableRow key={id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.sku}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.required}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.item_type === "inventory" ? c.on_hand : "—"}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${shortage ? "text-rose-600" : "text-emerald-600"}`}>
                      {net === null ? "—" : net}
                    </TableCell>
                    <TableCell>
                      {net === null ? (
                        <Badge variant="outline">N/A</Badge>
                      ) : shortage ? (
                        <Badge variant="destructive">Shortage</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
