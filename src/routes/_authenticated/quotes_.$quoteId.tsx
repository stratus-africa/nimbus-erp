import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
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
  CheckCircle2,
  Clock,
  UserCircle2,
  FilePlus2,
  Plus,
  Search,
  ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/quotes_/$quoteId")({
  head: () => ({ meta: [{ title: "Quote — Nimbus ERP" }] }),
  component: QuoteDetailPage,
});

type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "converted";

function QuoteDetailPage() {
  const { quoteId } = useParams({ from: "/_authenticated/quotes_/$quoteId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const [tab, setTab] = useState<"details" | "activity">("details");
  const [sidebarSearch, setSidebarSearch] = useState("");

  const { data: allQuotes } = useQuery({
    enabled: !!tenantId,
    queryKey: ["quotes-sidebar", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, total, status, quote_date, customers(name)")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("quote_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

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
        .select("*, items(name, sku, unit)")
        .eq("quote_id", quoteId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: createdByProfile } = useQuery({
    enabled: !!quote?.created_by,
    queryKey: ["profile-actor", quote?.created_by],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", quote!.created_by!)
        .maybeSingle();
      return data;
    },
  });

  const { data: convertedInvoice } = useQuery({
    enabled: !!tenantId && !!quoteId,
    queryKey: ["quote-converted-invoice", quoteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at, total")
        .eq("source_quote_id", quoteId!)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      return data;
    },
  });

  // Compute totals from lines (recalculated client-side)
  const totals = useMemo(() => {
    const ls = lines ?? [];
    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;
    for (const l of ls as any[]) {
      const qty = Number(l.quantity) || 0;
      const rate = Number(l.rate) || 0;
      const taxRate = Number(l.tax_rate) || 0;
      const gross = qty * rate;
      // No per-line discount column in schema; derive any difference between
      // line_total and gross+vat as discount so totals stay consistent.
      const recordedLineTotal = Number(l.line_total) || 0;
      const expectedNet = gross;
      const vat = +(expectedNet * (taxRate / 100)).toFixed(2);
      // Treat negative deviation from gross as a discount
      const lineDiscount = Math.max(0, expectedNet + vat - recordedLineTotal);
      subtotal += expectedNet;
      vatTotal += vat;
      discountTotal += lineDiscount;
    }
    const grandTotal = subtotal - discountTotal + vatTotal;
    return {
      subtotal: +subtotal.toFixed(2),
      discountTotal: +discountTotal.toFixed(2),
      vatTotal: +vatTotal.toFixed(2),
      grandTotal: +grandTotal.toFixed(2),
    };
  }, [lines]);

  const setStatus = useMutation({
    mutationFn: async (status: QuoteStatus) => {
      const { error } = await supabase
        .from("quotes")
        .update({ status })
        .eq("id", quoteId)
        .eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast.success(`Quote marked as ${status}`);
      qc.invalidateQueries({ queryKey: ["quote-detail", quoteId] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update quote"),
  });

  const convertToInvoice = useMutation({
    mutationFn: async () => {
      if (!tenantId || !quote) throw new Error("Missing tenant or quote");
      if (convertedInvoice) return convertedInvoice;
      const { data: numData, error: numErr } = await supabase.rpc("next_doc_number", {
        _tenant: tenantId,
        _doc_type: "invoice",
      });
      if (numErr) throw numErr;
      const { data: auth } = await supabase.auth.getUser();
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          invoice_number: numData as unknown as string,
          customer_id: quote.customer_id,
          invoice_date: new Date().toISOString().slice(0, 10),
          status: "draft",
          subtotal: totals.subtotal - totals.discountTotal,
          tax_total: totals.vatTotal,
          total: totals.grandTotal,
          balance_due: totals.grandTotal,
          notes: quote.notes,
          source_quote_id: quote.id,
          created_by: auth.user?.id,
        })
        .select()
        .single();
      if (invErr) throw invErr;
      const lineRows = (lines ?? []).map((l: any, idx: number) => ({
        invoice_id: inv.id,
        item_id: l.item_id,
        description: l.description,
        quantity: l.quantity,
        rate: l.rate,
        tax_rate: l.tax_rate,
        line_total: l.line_total,
        position: l.position ?? idx,
      }));
      if (lineRows.length) {
        const { error: lerr } = await supabase.from("invoice_lines").insert(lineRows);
        if (lerr) throw lerr;
      }
      await supabase
        .from("quotes")
        .update({ status: "converted" })
        .eq("id", quote.id)
        .eq("tenant_id", tenantId);
      return inv;
    },
    onSuccess: (inv: any) => {
      toast.success(`Invoice ${inv.invoice_number} created`);
      qc.invalidateQueries({ queryKey: ["quote-detail", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-converted-invoice", quoteId] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      navigate({ to: "/invoices" });
    },
    onError: (e: any) => toast.error(e.message ?? "Conversion failed"),
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

  const status = (quote.status ?? "draft") as QuoteStatus;
  const statusLabel = status === "converted" ? "Invoiced" : status.charAt(0).toUpperCase() + status.slice(1);
  const customerName = (quote.customers as any)?.name ?? "—";
  const billing = (quote.customers as any)?.billing_address ?? "—";
  const shipping = (quote.customers as any)?.shipping_address ?? "—";
  const actorName = createdByProfile?.full_name ?? createdByProfile?.email ?? "System";

  const activity = buildActivity(quote, convertedInvoice, actorName);

  const canSend = status === "draft";
  const canApprove = status === "draft" || status === "sent";
  const canConvert = (status === "accepted" || status === "sent" || status === "draft") && !convertedInvoice;

  const filteredQuotes = (allQuotes ?? []).filter((q: any) => {
    if (!sidebarSearch) return true;
    const s = sidebarSearch.toLowerCase();
    return (
      q.quote_number?.toLowerCase().includes(s) ||
      q.customers?.name?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex h-full bg-background">
      {/* Left sidebar: all quotes */}
      <aside className="hidden w-[320px] shrink-0 flex-col border-r bg-card md:flex">
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search in Quotes ( / )"
              className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <button className="inline-flex items-center gap-1 text-sm font-semibold">
            All Quotes <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              className="h-7 w-7 bg-emerald-500 text-white hover:bg-emerald-600"
              onClick={() => navigate({ to: "/quotes/new" })}
              aria-label="New quote"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredQuotes.map((q: any) => {
            const isActive = q.id === quoteId;
            const qStatus = (q.status ?? "draft") as string;
            const qLabel = qStatus === "converted" ? "INVOICED" : qStatus.toUpperCase();
            const statusColor =
              qStatus === "draft"
                ? "text-muted-foreground"
                : qStatus === "sent"
                  ? "text-blue-600"
                  : qStatus === "accepted"
                    ? "text-emerald-600"
                    : qStatus === "converted"
                      ? "text-emerald-600"
                      : qStatus === "rejected"
                        ? "text-rose-600"
                        : "text-muted-foreground";
            return (
              <button
                key={q.id}
                onClick={() =>
                  navigate({ to: "/quotes/$quoteId", params: { quoteId: q.id } })
                }
                className={`w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                  isActive ? "border-l-2 border-l-blue-600 bg-blue-50/60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {q.customers?.name ?? "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {q.quote_number} · {formatDate(q.quote_date)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                    {formatCurrency(Number(q.total ?? 0), currency)}
                  </div>
                </div>
                <div className={`mt-1 text-[10px] font-semibold tracking-wide ${statusColor}`}>
                  {qLabel}
                </div>
              </button>
            );
          })}
          {filteredQuotes.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No quotes found.
            </div>
          )}
        </div>
      </aside>

      {/* Main pane */}
      <div className="flex min-w-0 flex-1 flex-col">

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
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-6 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => navigate({ to: "/quotes/$quoteId/edit", params: { quoteId } })}
        >
          <Edit className="h-4 w-4" /> Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          disabled={!canSend || setStatus.isPending}
          onClick={() => setStatus.mutate("sent")}
        >
          <Send className="h-4 w-4" /> Mark as Sent
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          disabled={!canApprove || setStatus.isPending}
          onClick={() => setStatus.mutate("accepted")}
        >
          <CheckCircle2 className="h-4 w-4" /> Approve
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          disabled
          title="Sales Orders module not yet enabled"
        >
          <FilePlus2 className="h-4 w-4" /> Convert to Sales Order
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
          disabled={!canConvert || convertToInvoice.isPending}
          onClick={() => convertToInvoice.mutate()}
        >
          <FileText className="h-4 w-4" /> Convert to Invoice
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Share2 className="h-4 w-4" /> Share
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Printer className="h-4 w-4" /> PDF/Print
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
                Email this quote to your customer or mark it as sent.
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  className="h-8 bg-blue-600 text-white hover:bg-blue-700"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate("sent")}
                >
                  Mark As Sent
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate("accepted")}
                >
                  Approve
                </Button>
              </div>
            </div>
          )}

          {convertedInvoice && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <FileText className="h-4 w-4 text-blue-600" />
              <span>
                Converted to invoice{" "}
                <Link to="/invoices" className="font-semibold text-blue-700 hover:underline">
                  {convertedInvoice.invoice_number}
                </Link>{" "}
                on {formatDate(convertedInvoice.created_at)}.
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="mb-6 flex items-center justify-between border-b">
            <div className="flex gap-6">
              <button
                onClick={() => setTab("details")}
                className={
                  tab === "details"
                    ? "border-b-2 border-blue-600 px-1 pb-3 text-sm font-semibold text-blue-600"
                    : "px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                }
              >
                Quote Details
              </button>
              <button
                onClick={() => setTab("activity")}
                className={
                  tab === "activity"
                    ? "border-b-2 border-blue-600 px-1 pb-3 text-sm font-semibold text-blue-600"
                    : "px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                }
              >
                Activity Logs
              </button>
            </div>
          </div>

          {tab === "details" ? (
            <DetailsTab
              quote={quote}
              lines={lines ?? []}
              currency={currency}
              statusLabel={statusLabel}
              customerName={customerName}
              billing={billing}
              shipping={shipping}
              totals={totals}
            />
          ) : (
            <ActivityTab events={activity} />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function DetailsTab({
  quote,
  lines,
  currency,
  statusLabel,
  customerName,
  billing,
  shipping,
  totals,
}: {
  quote: any;
  lines: any[];
  currency: string;
  statusLabel: string;
  customerName: string;
  billing: string;
  shipping: string;
  totals: { subtotal: number; discountTotal: number; vatTotal: number; grandTotal: number };
}) {
  return (
    <>
      <div className="mb-8 flex items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{quote.quote_number}</h2>
        <Badge variant="secondary" className="font-normal capitalize">
          {statusLabel}
        </Badge>
      </div>
      <div className="-mt-6 mb-8 text-sm text-muted-foreground">
        Total :{" "}
        <span className="font-semibold text-foreground">
          {formatCurrency(totals.grandTotal, currency)}
        </span>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
        <Row label="Quote Number" value={quote.quote_number} />
        <Row label="Quote Date" value={formatDate(quote.quote_date)} />
        <Row label="Creation Date" value={formatDate(quote.created_at)} />
        <Row
          label="Expiry Date"
          value={quote.expiry_date ? formatDate(quote.expiry_date) : "—"}
        />
        <Row label="PDF Template" value="NIMBUS" />
        <Row label="Salesperson" value="—" />
      </div>

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

      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
        Items
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {lines.length}
        </span>
      </h3>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">#</th>
              <th className="px-3 py-2.5 text-left font-medium">Item / Description</th>
              <th className="px-3 py-2.5 text-right font-medium">Qty</th>
              <th className="px-3 py-2.5 text-right font-medium">Unit Price</th>
              <th className="px-3 py-2.5 text-right font-medium">Discount</th>
              <th className="px-3 py-2.5 text-right font-medium">VAT</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any, idx: number) => {
              const qty = Number(l.quantity) || 0;
              const rate = Number(l.rate) || 0;
              const taxRate = Number(l.tax_rate) || 0;
              const gross = qty * rate;
              const vat = +(gross * (taxRate / 100)).toFixed(2);
              const recorded = Number(l.line_total) || 0;
              const discount = Math.max(0, +(gross + vat - recorded).toFixed(2));
              const amount = +(gross - discount + vat).toFixed(2);
              return (
                <tr key={l.id} className="border-t align-top">
                  <td className="px-3 py-3 text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-blue-600">{l.items?.name ?? "—"}</div>
                    {l.items?.sku && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        SKU: {l.items.sku}
                        {l.items?.unit ? ` · ${l.items.unit}` : ""}
                      </div>
                    )}
                    {l.description && (
                      <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {l.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{qty}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatCurrency(rate, currency)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {discount > 0 ? formatCurrency(discount, currency) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div>{formatCurrency(vat, currency)}</div>
                    <div className="text-[10px] text-muted-foreground">{taxRate}%</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(amount, currency)}
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No line items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals summary */}
      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-sm space-y-2 rounded-lg border bg-card p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatCurrency(totals.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discounts</span>
            <span className="tabular-nums">
              {totals.discountTotal > 0 ? `− ${formatCurrency(totals.discountTotal, currency)}` : formatCurrency(0, currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">VAT Total</span>
            <span className="tabular-nums">{formatCurrency(totals.vatTotal, currency)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t pt-3 text-base">
            <span className="font-semibold">Grand Total</span>
            <span className="tabular-nums font-semibold">
              {formatCurrency(totals.grandTotal, currency)}
            </span>
          </div>
        </div>
      </div>

      {quote.notes && (
        <div className="mt-10">
          <h3 className="mb-2 text-sm font-semibold">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quote.notes}</p>
        </div>
      )}
    </>
  );
}

type ActivityEvent = {
  id: string;
  at: string;
  actor: string;
  title: string;
  description?: string;
  icon: "create" | "update" | "convert" | "status";
};

function buildActivity(quote: any, invoice: any, actorName: string): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  events.push({
    id: "created",
    at: quote.created_at,
    actor: actorName,
    title: `Created quote ${quote.quote_number}`,
    icon: "create",
  });
  if (quote.updated_at && quote.updated_at !== quote.created_at) {
    events.push({
      id: "updated",
      at: quote.updated_at,
      actor: actorName,
      title: `Quote updated`,
      description: `Status: ${quote.status}`,
      icon: quote.status === "converted" ? "convert" : "status",
    });
  }
  if (invoice) {
    events.push({
      id: `invoice-${invoice.id}`,
      at: invoice.created_at,
      actor: actorName,
      title: `Converted to invoice ${invoice.invoice_number}`,
      icon: "convert",
    });
  }
  return events.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}

function ActivityTab({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No activity yet.
      </div>
    );
  }
  return (
    <ol className="relative space-y-6 border-l pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[34px] grid h-6 w-6 place-items-center rounded-full border bg-card">
            {e.icon === "create" && <FilePlus2 className="h-3 w-3 text-blue-600" />}
            {e.icon === "convert" && <FileText className="h-3 w-3 text-blue-600" />}
            {e.icon === "status" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
            {e.icon === "update" && <Edit className="h-3 w-3 text-muted-foreground" />}
          </span>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium">{e.title}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> {formatDateTime(e.at)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserCircle2 className="h-3.5 w-3.5" /> {e.actor}
          </div>
          {e.description && (
            <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
          )}
        </li>
      ))}
    </ol>
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
