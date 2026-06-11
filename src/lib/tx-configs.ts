import type { DocConfig } from "@/components/transactions-module";

export const invoiceConfig: DocConfig = {
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
    { value: "sent", label: "Sent" },
    { value: "partially_paid", label: "Partially Paid" },
    { value: "paid", label: "Paid" },
    { value: "overdue", label: "Overdue" },
    { value: "cancelled", label: "Cancelled" },
  ],
};
