import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TransactionFormPage } from "@/components/transaction-form-page";
import { useProfile } from "@/hooks/use-profile";
import { creditNoteConfig } from "@/lib/tx-configs";

export const Route = createFileRoute("/_authenticated/credit-notes_/$creditNoteId_/edit")({
  head: () => ({ meta: [{ title: "Edit Credit Note — Nimbus ERP" }] }),
  component: EditCreditNotePage,
});

function EditCreditNotePage() {
  const { creditNoteId } = useParams({
    from: "/_authenticated/credit-notes_/$creditNoteId_/edit",
  });
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  void navigate;
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";

  const { data: creditNote, isLoading } = useQuery({
    enabled: !!tenantId && !!creditNoteId,
    queryKey: ["credit-note", creditNoteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("credit_notes")
        .select("*")
        .eq("id", creditNoteId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (!tenantId || isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!creditNote) return <div className="p-6 text-muted-foreground">Credit note not found.</div>;

  return (
    <TransactionFormPage
      config={creditNoteConfig}
      tenantId={tenantId}
      currency={currency}
      initial={creditNote}
      backTo="/credit-notes"
    />
  );
}
