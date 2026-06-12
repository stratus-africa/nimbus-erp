import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SalesOrderFormPage } from "./sales-orders_.new";

export const Route = createFileRoute("/_authenticated/sales-orders_/$soId_/edit")({
  head: () => ({ meta: [{ title: "Edit Sales Order — Nimbus ERP" }] }),
  component: EditSalesOrderPage,
});

function EditSalesOrderPage() {
  const { soId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-order-edit", soId],
    queryFn: async () => {
      const { data: so, error: qe } = await (supabase as any)
        .from("sales_orders")
        .select("*")
        .eq("id", soId)
        .single();
      if (qe) throw qe;
      const { data: lines, error: le } = await (supabase as any)
        .from("sales_order_lines")
        .select("*")
        .eq("sales_order_id", soId)
        .order("position");
      if (le) throw le;
      return {
        ...so,
        lines: (lines ?? []).map((l: any) => ({
          item_id: l.item_id,
          description: l.description ?? "",
          quantity: Number(l.quantity) || 0,
          rate: Number(l.rate) || 0,
          tax_rate: Number(l.tax_rate) || 0,
        })),
      };
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading sales order…</div>;
  if (error || !data)
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">Sales Order not found.</p>
        <button className="text-sm text-primary hover:underline" onClick={() => navigate({ to: "/sales-orders" })}>
          Back to sales orders
        </button>
      </div>
    );

  return <SalesOrderFormPage editId={soId} initial={data} />;
}
