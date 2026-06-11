import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PaymentFormPage } from "@/components/payment-form-page";
import { paymentsReceivedConfig } from "./payments-received";

const searchSchema = z.object({
  partyId: z.string().optional(),
  docId: z.string().optional(),
  amount: z.coerce.number().optional(),
});

export const Route = createFileRoute("/_authenticated/payments-received_/new")({
  head: () => ({ meta: [{ title: "Record Payment Received — Nimbus ERP" }] }),
  validateSearch: searchSchema,
  component: () => <PaymentFormPage config={paymentsReceivedConfig} />,
});
