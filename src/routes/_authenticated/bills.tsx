import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionsListing } from "@/components/transactions-listing";
import { billConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => ({ meta: [{ title: "Bills — Nimbus ERP" }] }),
  component: BillsPage,
});

function BillsPage() {
  const navigate = useNavigate();
  return (
    <TransactionsListing
      numberLabel="Bill Number"
      config={billConfig}
      onNew={() => navigate({ to: "/bills/new" })}
      onRowClick={(r) => navigate({ to: "/bills/$billId", params: { billId: r.id } })}
    />
  );
}
