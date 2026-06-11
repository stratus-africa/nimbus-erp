import { createFileRoute } from "@tanstack/react-router";
import { PaymentsListing, type PaymentsModuleConfig } from "@/components/payments-listing";

const config: PaymentsModuleConfig = {
  kind: "received",
  title: "Payments Received",
  table: "invoice_payments",
  docFk: "invoice_id",
  docTable: "invoices",
  docNumberField: "invoice_number",
  partyTable: "customers",
  partyLabel: "Customer",
  newRoute: "/payments-received/new",
};

export const Route = createFileRoute("/_authenticated/payments-received")({
  head: () => ({ meta: [{ title: "Payments Received — Nimbus ERP" }] }),
  component: () => <PaymentsListing config={config} />,
});

export { config as paymentsReceivedConfig };
