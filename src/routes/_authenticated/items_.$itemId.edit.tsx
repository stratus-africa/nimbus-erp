import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ItemFormPage } from "./items_.new";

export const Route = createFileRoute("/_authenticated/items_/$itemId/edit")({
  head: () => ({ meta: [{ title: "Edit Item — Nimbus ERP" }] }),
  component: EditItemRoute,
});

function EditItemRoute() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", itemId).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading item…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">Item not found.</p>
        <button className="text-sm text-primary hover:underline" onClick={() => navigate({ to: "/items" })}>
          Back to items
        </button>
      </div>
    );
  }

  const item = data as any;
  const descParts = (item.description ?? "").split("\n---\n");
  const salesDesc = descParts[0] ?? "";
  const purchaseDesc = descParts[1] ?? "";

  const type: "goods" | "service" = item.item_type === "service" ? "service" : "goods";
  const trackInventory = item.item_type === "inventory";

  const initial = {
    type,
    name: item.name ?? "",
    sku: item.sku ?? "",
    unit: item.unit ?? "",
    hs_code: "",
    sellable: (item.selling_price ?? 0) > 0,
    purchasable: (item.cost_price ?? 0) > 0,
    selling_price: item.selling_price ?? 0,
    cost_price: item.cost_price ?? 0,
    sales_account: "",
    purchase_account: "",
    sales_vat: "",
    purchase_vat: "",
    sales_desc: salesDesc,
    purchase_desc: purchaseDesc,
    preferred_vendor: "",
    track_inventory: trackInventory,
    inventory_account: "",
    valuation: "fifo" as const,
    reorder_level: item.reorder_level ?? 0,
  };

  return <ItemFormPage itemId={itemId} initial={initial} />;
}
