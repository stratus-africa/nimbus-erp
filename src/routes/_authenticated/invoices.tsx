import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionsListing } from "@/components/transactions-listing";
import { invoiceConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Nimbus ERP" }] }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const navigate = useNavigate();
  return (
    <TransactionsListing
      numberLabel="Invoice Number"
      config={invoiceConfig}
      onNew={() => navigate({ to: "/invoices/new" })}
      onRowClick={(row) =>
        navigate({
          to: "/invoices/$invoiceId/edit",
          params: { invoiceId: row.id },
        })
      }
    />
  );
}
