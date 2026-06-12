import { createFileRoute } from "@tanstack/react-router";
import { PaymentDetailPage } from "@/components/payment-detail-page";
import { paymentsReceivedConfig } from "./payments-received";

export const Route = createFileRoute("/_authenticated/payments-received_/$paymentId")({
  head: () => ({ meta: [{ title: "Payment Received — Nimbus ERP" }] }),
  component: () => <PaymentDetailPage config={paymentsReceivedConfig} />,
});
