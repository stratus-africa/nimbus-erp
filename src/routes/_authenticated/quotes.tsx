import { createFileRoute } from "@tanstack/react-router";
import { TransactionsModule } from "@/components/transactions-module";

export const Route = createFileRoute("/_authenticated/quotes")({
  head: () => ({ meta: [{ title: "Quotes — Nimbus ERP" }] }),
  component: () => (
    <TransactionsModule config={{
      kind: "quote",
      title: "Quotes",
      description: "Sales quotes and estimates.",
      docTable: "quotes",
      linesTable: "quote_lines",
      numberField: "quote_number",
      dateField: "quote_date",
      secondaryDateField: "expiry_date",
      secondaryDateLabel: "Expiry date",
      partyField: "customer_id",
      partyTable: "customers",
      partyLabel: "Customer",
      docTypeForNumbering: "quote",
      fkLinesField: "quote_id",
      statuses: [
        { value: "draft", label: "Draft" },
        { value: "sent", label: "Sent" },
        { value: "accepted", label: "Accepted" },
        { value: "rejected", label: "Rejected" },
        { value: "converted", label: "Converted" },
      ],
    }} />
  ),
});
