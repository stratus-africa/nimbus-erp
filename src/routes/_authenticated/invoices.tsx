import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionsModule } from "@/components/transactions-module";

type InvoiceSearch = { from?: string; to?: string; onlyOpen?: boolean };

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Nimbus ERP" }] }),
  validateSearch: (s: Record<string, unknown>): InvoiceSearch => ({
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
    onlyOpen: s.onlyOpen === true || s.onlyOpen === "true" ? true : undefined,
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const { from, to, onlyOpen } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <TransactionsModule
      filter={{ from, to, onlyOpen }}
      onClearFilter={() => navigate({ to: "/invoices", search: {} })}
      config={{
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
      }}
    />
  );
}
