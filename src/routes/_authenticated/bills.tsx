import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionsModule } from "@/components/transactions-module";

type BillSearch = { from?: string; to?: string; onlyOpen?: boolean };

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => ({ meta: [{ title: "Bills — Nimbus ERP" }] }),
  validateSearch: (s: Record<string, unknown>): BillSearch => ({
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
    onlyOpen: s.onlyOpen === true || s.onlyOpen === "true" ? true : undefined,
  }),
  component: BillsPage,
});

function BillsPage() {
  const { from, to, onlyOpen } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <TransactionsModule
      filter={{ from, to, onlyOpen }}
      onClearFilter={() => navigate({ to: "/bills", search: {} })}
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
          { value: "partially_paid", label: "Partially paid" },
          { value: "paid", label: "Paid" },
          { value: "overdue", label: "Overdue" },
          { value: "cancelled", label: "Cancelled" },
        ],
      }}
    />
  );
}
