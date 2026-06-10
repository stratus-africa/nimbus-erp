import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ArrowLeft,
  Edit,
  Send,
  Share2,
  Printer,
  FileText,
  MoreHorizontal,
  Sparkles,
  Paperclip,
  MessageSquare,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/quotes_/$quoteId")({
  head: () => ({ meta: [{ title: "Quote — Nimbus ERP" }] }),
  component: QuoteDetailPage,
});

function QuoteDetailPage() {
  const { quoteId } = useParams({ from: "/_authenticated/quotes_/$quoteId" });
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";

  const { data: quote, isLoading } = useQuery({
    enabled: !!tenantId && !!quoteId,
    queryKey: ["quote-detail", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, customers(name, billing_address, shipping_address)")
        .eq("id", quoteId)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lines } = useQuery({
    enabled: !!quoteId,
    queryKey: ["quote-lines", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_lines")
        .select("*, items(name, sku)")
        .eq("quote_id", quoteId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground">Loading quote…</div>;
  }
  if (!quote) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Quote not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/quotes" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Quotes
        </Button>
      </div>
    );
  }

  const status = (quote.status ?? "draft") as string;
  const statusLabel = status === "converted" ? "Invoiced" : status.charAt(0).toUpperCase() + status.slice(1);
  const customerName = (quote.customers as any)?.name ?? "—";
  const billing = (quote.customers as any)?.billing_address ?? "—";
  const shipping = (quote.customers as any)?.shipping_address ?? "—";
  const subtotal = Number(quote.subtotal ?? 0);
  const taxTotal = Number(quote.tax_total ?? 0);
  const total = Number(quote.total ?? 0);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">
              Location: <span className="font-medium text-foreground">Head Office</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{quote.quote_number}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Attachments">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Comments">
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              aria-label="Close"
              onClick={() => navigate({ to: "/quotes" })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 border-b bg-muted/30 px-6 py-2">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Edit className="h-4 w-4" /> Edit
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Send className="h-4 w-4" /> Send
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Share2 className="h-4 w-4" /> Share
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Printer className="h-4 w-4" /> PDF/Print
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <FileText className="h-4 w-4" /> Convert to Invoice
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl p-6">
          {/* Next steps card */}
          {status === "draft" && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What's next?
              </span>
              <span className="text-sm text-foreground">
                Go ahead and email this quote to your customer or simply mark it as sent.
              </span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" className="h-8 bg-blue-600 text-white hover:bg-blue-700">
                  Send Quote
                </Button>
                <Button size="sm" variant="outline" className="h-8">
                  Mark As Sent
                </Button>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="mb-6 flex items-center justify-between border-b">
            <div className="flex gap-6">
              <button className="border-b-2 border-blue-600 px-1 pb-3 text-sm font-semibold text-blue-600">
                Quote Details
              </button>
              <button className="px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                Activity Logs
              </button>
            </div>
            <div className="flex items-center gap-1 pb-2 text-xs">
              <button className="rounded border bg-card px-3 py-1.5 font-medium">Details</button>
              <button className="px-3 py-1.5 text-muted-foreground hover:text-foreground">PDF</button>
            </div>
          </div>

          {/* Title block */}
          <div className="mb-8 flex items-baseline gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{quote.quote_number}</h2>
            <Badge variant="secondary" className="font-normal capitalize">{statusLabel}</Badge>
          </div>
          <div className="-mt-6 mb-8 text-sm text-muted-foreground">
            Total : <span className="font-semibold text-foreground">{formatCurrency(total, currency)}</span>
          </div>

          {/* Detail grid */}
          <div className="mb-10 grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
            <Row label="Quote Number" value={quote.quote_number} />
            <Row label="Quote Date" value={formatDate(quote.quote_date)} />
            <Row label="Creation Date" value={formatDate(quote.created_at)} />
            <Row label="Expiry Date" value={quote.expiry_date ? formatDate(quote.expiry_date) : "—"} />
            <Row label="PDF Template" value="NIMBUS" />
            <Row label="Salesperson" value="—" />
          </div>

          {/* Customer */}
          <h3 className="mb-4 text-base font-semibold">Customer Details</h3>
          <div className="mb-10 grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
            <Row
              label="Name"
              value={
                <span className="inline-flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                    {customerName.charAt(0).toUpperCase()}
                  </span>
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: quote.customer_id ?? "" }}
                    className="text-blue-600 hover:underline"
                  >
                    {customerName}
                  </Link>
                </span>
              }
            />
            <div />
            <Row label="Billing Address" value={billing || "—"} />
            <Row label="Shipping Address" value={shipping || "—"} />
          </div>

          {/* Items */}
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
            Items
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {lines?.length ?? 0}
            </span>
          </h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">S.NO</th>
                  <th className="px-4 py-2.5 text-left font-medium">Item</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Discount</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(lines ?? []).map((l: any, idx: number) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-3">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-blue-600">{l.items?.name ?? "—"}</div>
                      {l.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{l.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(l.quantity)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(Number(l.rate), currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(Number(l.line_total), currency)}
                    </td>
                  </tr>
                ))}
                {(lines?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No line items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-sm space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold">Sub Total</span>
                <span className="tabular-nums font-semibold">{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax Total</span>
                <span className="tabular-nums">{formatCurrency(taxTotal, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Adjustment</span>
                <span className="tabular-nums">0</span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-3 text-base">
                <span className="font-semibold">Total</span>
                <span className="tabular-nums font-semibold">{formatCurrency(total, currency)}</span>
              </div>
            </div>
          </div>

          {quote.notes && (
            <div className="mt-10">
              <h3 className="mb-2 text-sm font-semibold">Notes</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quote.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
