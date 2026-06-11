import { createFileRoute } from "@tanstack/react-router";
import { PaymentsListing, type PaymentsModuleConfig } from "@/components/payments-listing";

const config: PaymentsModuleConfig = {
  kind: "made",
  title: "Payments Made",
  table: "bill_payments",
  docFk: "bill_id",
  docTable: "bills",
  docNumberField: "bill_number",
  partyTable: "suppliers",
  partyLabel: "Supplier",
  newRoute: "/payments-made/new",
};

export const Route = createFileRoute("/_authenticated/payments-made")({
  head: () => ({ meta: [{ title: "Payments Made — Nimbus ERP" }] }),
  component: () => <PaymentsListing config={config} />,
});

export { config as paymentsMadeConfig };
