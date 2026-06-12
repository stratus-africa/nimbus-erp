import { createFileRoute } from "@tanstack/react-router";
import { PaymentDetailPage } from "@/components/payment-detail-page";
import { paymentsMadeConfig } from "./payments-made";

export const Route = createFileRoute("/_authenticated/payments-made_/$paymentId")({
  head: () => ({ meta: [{ title: "Payment Made — Nimbus ERP" }] }),
  component: () => <PaymentDetailPage config={paymentsMadeConfig} />,
});
