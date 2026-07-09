import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionFormPage } from "@/components/transaction-form-page";
import { useProfile } from "@/hooks/use-profile";
import { creditNoteConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/credit-notes_/new")({
  head: () => ({ meta: [{ title: "New Credit Note — Nimbus ERP" }] }),
  component: NewCreditNotePage,
});

function NewCreditNotePage() {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  if (!tenantId) return <div className="p-6 text-muted-foreground">Loading…</div>;
  void navigate;
  return (
    <TransactionFormPage
      config={creditNoteConfig}
      tenantId={tenantId}
      currency={currency}
      backTo="/credit-notes"
    />
  );
}
