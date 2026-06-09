import { createFileRoute } from "@tanstack/react-router";
import { TransactionsModule } from "@/components/transactions-module";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Nimbus ERP" }] }),
  component: () => (
    <TransactionsModule config={{
      kind: "invoice",
      title: "Invoices",
      description: "Customer invoices and receivables.",
      docTable: "invoices",
      linesTable: "invoice_lines",
      numberField: "invoice_number",
      dateField: "invoice_date",
      secondaryDateField: "due_date",
      secondaryDateLabel: "Due date",
      partyField: "customer_id",
      partyTable: "customers",
      partyLabel: "Customer",
      docTypeForNumbering: "invoice",
      fkLinesField: "invoice_id",
      statuses: [
        { value: "draft", label: "Draft" },
        { value: "open", label: "Open" },
        { value: "partially_paid", label: "Partially paid" },
        { value: "paid", label: "Paid" },
        { value: "overdue", label: "Overdue" },
        { value: "cancelled", label: "Cancelled" },
      ],
    }} />
  ),
});
