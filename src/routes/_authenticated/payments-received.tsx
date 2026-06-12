import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
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

const searchSchema = z.object({
  unallocated: fallback(z.boolean(), false).default(false),
  partyId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/payments-received")({
  head: () => ({ meta: [{ title: "Payments Received — Nimbus ERP" }] }),
  validateSearch: zodValidator(searchSchema),
  component: PaymentsReceivedPage,
});

function PaymentsReceivedPage() {
  const { unallocated, partyId } = Route.useSearch();
  return <PaymentsListing config={config} unallocated={unallocated} partyId={partyId} />;
}

export { config as paymentsReceivedConfig };
