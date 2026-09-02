import { createFileRoute } from "@tanstack/react-router";
import { WarehouseDetailPage } from "@/components/warehouse-detail-page";

export const Route = createFileRoute("/_authenticated/inventory/warehouses/$id")({
  component: InventoryWarehouseDetailPage,
});

function InventoryWarehouseDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <WarehouseDetailPage
        id={id}
        backTo="/inventory/warehouses"
        backLabel="Warehouses"
      />
    </div>
  );
}
