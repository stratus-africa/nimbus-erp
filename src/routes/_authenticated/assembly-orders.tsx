import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Factory } from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/assembly-orders")({
  head: () => ({ meta: [{ title: "Assembly Orders — Nimbus ERP" }] }),
  component: AssemblyOrdersPage,
});

function AssemblyOrdersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["assembly-orders", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("assembly_orders")
        .select("id, order_number, status, quantity, completed_at, created_at, assembly_item_id, items:assembly_item_id(name, sku)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="-m-6">
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => qc.invalidateQueries({ queryKey: ["assembly-orders"] })} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Factory className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Assembly Orders</h1>
        </div>
        <Button onClick={() => navigate({ to: "/assembly-orders/new" })} className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4" /> New Assembly Order
        </Button>
      </div>

      <div className="border-t bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Order #</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No assembly orders yet.</TableCell></TableRow>
            ) : rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="pl-6">
                  <Link to="/assembly-orders/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.order_number ?? r.id.slice(0, 8)}</Link>
                </TableCell>
                <TableCell>{r.items?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.items?.sku ?? ""}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.quantity)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "completed" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"} className="capitalize">{r.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                <TableCell className="text-muted-foreground">{r.completed_at ? formatDate(r.completed_at) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
