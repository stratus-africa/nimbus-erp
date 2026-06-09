import { createFileRoute } from "@tanstack/react-router";
import { TransactionsModule } from "@/components/transactions-module";

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => ({ meta: [{ title: "Bills — Nimbus ERP" }] }),
  component: () => (
    <TransactionsModule config={{
      kind: "bill",
      title: "Bills",
      description: "Vendor bills and payables.",
      docTable: "bills",
      linesTable: "bill_lines",
      numberField: "bill_number",
      dateField: "bill_date",
      secondaryDateField: "due_date",
      secondaryDateLabel: "Due date",
      partyField: "supplier_id",
      partyTable: "suppliers",
      partyLabel: "Supplier",
      docTypeForNumbering: "bill",
      fkLinesField: "bill_id",
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
