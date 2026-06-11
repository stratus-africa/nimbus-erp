import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionsListing } from "@/components/transactions-listing";
import { purchaseOrderConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  head: () => ({ meta: [{ title: "Purchase Orders — Nimbus ERP" }] }),
  component: PurchaseOrdersPage,
});

function PurchaseOrdersPage() {
  const navigate = useNavigate();
  return (
    <TransactionsListing
      numberLabel="PO Number"
      config={purchaseOrderConfig}
      onNew={() => navigate({ to: "/purchase-orders/new" })}
    />
  );
}
