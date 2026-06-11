import { createFileRoute } from "@tanstack/react-router";
import { TransactionsListing } from "@/components/transactions-listing";

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => ({ meta: [{ title: "Bills — Nimbus ERP" }] }),
  component: BillsPage,
});

function BillsPage() {
  return (
    <TransactionsListing
      numberLabel="Bill Number"
      config={{
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
          { value: "partially_paid", label: "Partially Paid" },
          { value: "paid", label: "Paid" },
          { value: "overdue", label: "Overdue" },
          { value: "cancelled", label: "Cancelled" },
        ],
      }}
    />
  );
}
