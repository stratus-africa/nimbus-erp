import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionFormPage } from "@/components/transaction-form-page";
import { useProfile } from "@/hooks/use-profile";
import { invoiceConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/invoices_/new")({
  head: () => ({ meta: [{ title: "New Invoice — Nimbus ERP" }] }),
  component: NewInvoicePage,
});

function NewInvoicePage() {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  if (!tenantId) return <div className="p-6 text-muted-foreground">Loading…</div>;
  void navigate;
  return (
    <TransactionFormPage
      config={invoiceConfig}
      tenantId={tenantId}
      currency={currency}
      backTo="/invoices"
    />
  );
}
