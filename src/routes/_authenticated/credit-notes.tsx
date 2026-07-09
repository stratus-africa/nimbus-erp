import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionsListing } from "@/components/transactions-listing";
import { creditNoteConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/credit-notes")({
  head: () => ({ meta: [{ title: "Credit Notes — Nimbus ERP" }] }),
  component: CreditNotesPage,
});

function CreditNotesPage() {
  const navigate = useNavigate();
  return (
    <TransactionsListing
      numberLabel="Credit Note Number"
      config={creditNoteConfig}
      onNew={() => navigate({ to: "/credit-notes/new" })}
      onRowClick={(row) =>
        navigate({
          to: "/credit-notes/$creditNoteId/edit",
          params: { creditNoteId: row.id },
        })
      }
    />
  );
}
