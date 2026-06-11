import { createFileRoute } from "@tanstack/react-router";
import { PaymentFormPage } from "@/components/payment-form-page";
import { paymentsMadeConfig } from "./payments-made";

export const Route = createFileRoute("/_authenticated/payments-made_/new")({
  head: () => ({ meta: [{ title: "Record Payment Made — Nimbus ERP" }] }),
  component: () => <PaymentFormPage config={paymentsMadeConfig} />,
});
