import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QuoteFormPage } from "./quotes_.new";

export const Route = createFileRoute("/_authenticated/quotes_/$quoteId_/edit")({
  head: () => ({ meta: [{ title: "Edit Quote — Nimbus ERP" }] }),
  component: EditQuotePage,
});

function EditQuotePage() {
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["quote-edit", quoteId],
    queryFn: async () => {
      const { data: q, error: qe } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .single();
      if (qe) throw qe;
      const { data: lines, error: le } = await supabase
        .from("quote_lines")
        .select("*")
        .eq("quote_id", quoteId)
        .order("position");
      if (le) throw le;
      return {
        ...q,
        lines: (lines ?? []).map((l: any) => ({
          item_id: l.item_id,
          description: l.description ?? "",
          quantity: Number(l.quantity) || 0,
          rate: Number(l.rate) || 0,
          tax_rate: Number(l.tax_rate) || 0,
        })),
      };
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading quote…</div>;
  if (error || !data)
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">Quote not found.</p>
        <button className="text-sm text-primary hover:underline" onClick={() => navigate({ to: "/quotes" })}>
          Back to quotes
        </button>
      </div>
    );

  return <QuoteFormPage editId={quoteId} initial={data} />;
}
