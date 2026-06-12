import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TransactionFormPage } from "@/components/transaction-form-page";
import { useProfile } from "@/hooks/use-profile";
import { invoiceConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/invoices_/$invoiceId_/edit")({
  head: () => ({ meta: [{ title: "Edit Invoice — Nimbus ERP" }] }),
  component: EditInvoicePage,
});

function EditInvoicePage() {
  const { invoiceId } = useParams({ from: "/_authenticated/invoices_/$invoiceId_/edit" });
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  void navigate;
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";

  const { data: invoice, isLoading } = useQuery({
    enabled: !!tenantId && !!invoiceId,
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (!tenantId || isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!invoice) return <div className="p-6 text-muted-foreground">Invoice not found.</div>;

  return (
    <TransactionFormPage
      config={invoiceConfig}
      tenantId={tenantId}
      currency={currency}
      initial={invoice}
      backTo="/invoices"
    />
  );
}
