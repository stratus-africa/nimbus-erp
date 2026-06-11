import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PaymentFormPage } from "@/components/payment-form-page";
import { paymentsMadeConfig } from "./payments-made";

const searchSchema = z.object({
  partyId: z.string().optional(),
  docId: z.string().optional(),
  amount: z.coerce.number().optional(),
});

export const Route = createFileRoute("/_authenticated/payments-made_/new")({
  head: () => ({ meta: [{ title: "Record Payment Made — Nimbus ERP" }] }),
  validateSearch: searchSchema,
  component: () => <PaymentFormPage config={paymentsMadeConfig} />,
});
