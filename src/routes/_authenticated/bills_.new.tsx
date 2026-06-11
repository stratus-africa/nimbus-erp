import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionFormPage } from "@/components/transaction-form-page";
import { useProfile } from "@/hooks/use-profile";
import { billConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/bills_/new")({
  head: () => ({ meta: [{ title: "New Bill — Nimbus ERP" }] }),
  component: NewBillPage,
});

function NewBillPage() {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  if (!tenantId) return <div className="p-6 text-muted-foreground">Loading…</div>;
  void navigate;
  return (
    <TransactionFormPage
      config={billConfig}
      tenantId={tenantId}
      currency={currency}
      backTo="/bills"
    />
  );
}
