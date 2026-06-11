import { createFileRoute } from "@tanstack/react-router";
import { PaymentFormPage } from "@/components/payment-form-page";
import { paymentsReceivedConfig } from "./payments-received";

export const Route = createFileRoute("/_authenticated/payments-received_/new")({
  head: () => ({ meta: [{ title: "Record Payment Received — Nimbus ERP" }] }),
  component: () => <PaymentFormPage config={paymentsReceivedConfig} />,
});
