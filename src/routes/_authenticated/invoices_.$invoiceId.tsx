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
  Wallet,
} from "lucide-react";
import { DocActionsMenu } from "@/components/doc-actions-menu";

export const Route = createFileRoute("/_authenticated/invoices_/$invoiceId")({
  head: () => ({ meta: [{ title: "Invoice — Nimbus ERP" }] }),
  component: InvoiceDetailPage,
});

type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

const STATUS_COLOR: Record<string, string> = {
  draft: "text-muted-foreground",
  open: "text-blue-600",
  partially_paid: "text-amber-600",
  paid: "text-emerald-600",
  overdue: "text-rose-600",
  cancelled: "text-rose-600",
};

function statusToLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function InvoiceDetailPage() {
  const { invoiceId } = useParams({ from: "/_authenticated/invoices_/$invoiceId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const [tab, setTab] = useState<"details" | "activity">("details");
  const [sidebarSearch, setSidebarSearch] = useState("");

  const { data: allInvoices } = useQuery({
    enabled: !!tenantId,
    queryKey: ["invoices-sidebar", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, total, balance_due, status, invoice_date, due_date, customers(name)",
        )
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("invoice_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoice, isLoading } = useQuery({
    enabled: !!tenantId && !!invoiceId,
    queryKey: ["invoice-detail", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(name, billing_address, shipping_address)")
        .eq("id", invoiceId)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lines } = useQuery({
    enabled: !!invoiceId,
    queryKey: ["invoice-lines", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_lines")
        .select("*, items(name, sku, unit)")
        .eq("invoice_id", invoiceId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payments } = useQuery({
    enabled: !!invoiceId,
    queryKey: ["invoice-payments", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: createdByProfile } = useQuery({
    enabled: !!invoice?.created_by,
    queryKey: ["profile-actor", invoice?.created_by],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", invoice!.created_by!)
        .maybeSingle();
      return data;
    },
  });

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
      const recordedLineTotal = Number(l.line_total) || 0;
      const vat = +(gross * (taxRate / 100)).toFixed(2);
      const lineDiscount = Math.max(0, gross + vat - recordedLineTotal);
      subtotal += gross;
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
    mutationFn: async (status: InvoiceStatus) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status })
        .eq("id", invoiceId)
        .eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast.success(`Invoice marked as ${status}`);
      qc.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoices-list"] });
      qc.invalidateQueries({ queryKey: ["invoices-sidebar"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update invoice"),
  });

  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground">Loading invoice…</div>;
  }
  if (!invoice) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/invoices" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
        </Button>
      </div>
    );
  }

  const status = (invoice.status ?? "draft") as InvoiceStatus;
  const overdue =
    status !== "paid" &&
    status !== "cancelled" &&
    invoice.due_date &&
    new Date(invoice.due_date) < new Date(new Date().toDateString());
  const effectiveStatus = overdue && status !== "partially_paid" ? "overdue" : status;
  const statusLabel = statusToLabel(effectiveStatus);
  const customerName = (invoice.customers as any)?.name ?? "—";
  const billing = (invoice.customers as any)?.billing_address ?? "—";
  const shipping = (invoice.customers as any)?.shipping_address ?? "—";
  const actorName = createdByProfile?.full_name ?? createdByProfile?.email ?? "System";
  const balanceDue = Number(invoice.balance_due ?? totals.grandTotal);
  const amountPaid = Number(invoice.amount_paid ?? 0);

  const activity = buildActivity(invoice, payments ?? [], actorName);

  const canSend = status === "draft";
  const canRecordPayment = balanceDue > 0 && status !== "cancelled";

  const filteredInvoices = (allInvoices ?? []).filter((i: any) => {
    if (!sidebarSearch) return true;
    const s = sidebarSearch.toLowerCase();
    return (
      i.invoice_number?.toLowerCase().includes(s) ||
      i.customers?.name?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex h-full bg-background">
      {/* Left sidebar: all invoices */}
      <aside className="hidden w-[320px] shrink-0 flex-col border-r bg-card md:flex">
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search in Invoices ( / )"
              className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <button className="inline-flex items-center gap-1 text-sm font-semibold">
            All Invoices <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              className="h-7 w-7 bg-emerald-500 text-white hover:bg-emerald-600"
              onClick={() => navigate({ to: "/invoices/new" })}
              aria-label="New invoice"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredInvoices.map((i: any) => {
            const isActive = i.id === invoiceId;
            const iOverdue =
              i.status !== "paid" &&
              i.status !== "cancelled" &&
              i.due_date &&
              new Date(i.due_date) < new Date(new Date().toDateString());
            const eff =
              iOverdue && i.status !== "partially_paid" ? "overdue" : (i.status ?? "draft");
            const color = STATUS_COLOR[eff] ?? "text-muted-foreground";
            return (
              <button
                key={i.id}
                onClick={() =>
                  navigate({ to: "/invoices/$invoiceId", params: { invoiceId: i.id } })
                }
                className={`w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                  isActive ? "border-l-2 border-l-blue-600 bg-blue-50/60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {i.customers?.name ?? "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {i.invoice_number} · {formatDate(i.invoice_date)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                    {formatCurrency(Number(i.total ?? 0), currency)}
                  </div>
                </div>
                <div className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${color}`}>
                  {statusToLabel(eff)}
                </div>
              </button>
            );
          })}
          {filteredInvoices.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No invoices found.
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
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {invoice.invoice_number}
              </h1>
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
                onClick={() => navigate({ to: "/invoices" })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-6 py-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
          >
            <Link
              to="/invoices/$invoiceId/edit"
              params={{ invoiceId }}
            >
              <Edit className="h-4 w-4" /> Edit
            </Link>
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
            disabled={!canRecordPayment}
            onClick={() => navigate({ to: "/payments-received/new", search: { partyId: invoice.customer_id, docId: invoice.id, amount: balanceDue } })}
          >
            <Wallet className="h-4 w-4" /> Record Payment
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5">
            <Share2 className="h-4 w-4" /> Share
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5">
            <Printer className="h-4 w-4" /> PDF/Print
          </Button>
          <DocActionsMenu
            docId={invoiceId}
            invalidateKeys={["invoices", "invoices-sidebar", "invoice-detail"]}
            config={{
              docTable: "invoices",
              linesTable: "invoice_lines",
              fkLinesField: "invoice_id",
              numberField: "invoice_number",
              numberingDocType: "invoice",
              dateField: "invoice_date",
              sourceRefFields: ["source_quote_id", "source_sales_order_id"],
              cloneOmitFields: ["amount_paid"],
              listRoute: "/invoices",
              detailRoute: "/invoices/$invoiceId",
              detailParamKey: "invoiceId",
              label: "Invoice",
              hasLines: true,
              softDelete: true,
            }}
          />
        </div>

        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-5xl p-6">
            {/* Next steps */}
            {status === "draft" && (
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What's next?
                </span>
                <span className="text-sm text-foreground">
                  Email this invoice to your customer or mark it as sent.
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
                </div>
              </div>
            )}

            {effectiveStatus === "overdue" && balanceDue > 0 && (
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                <Sparkles className="h-4 w-4 text-rose-600" />
                <span>
                  Payment is overdue. Send a reminder or{" "}
                  <button
                    className="font-semibold text-rose-700 hover:underline"
                    onClick={() => navigate({ to: "/payments-received/new", search: { partyId: invoice.customer_id, docId: invoice.id, amount: balanceDue } })}
                  >
                    record payment
                  </button>
                  .
                </span>
                <Button
                  size="sm"
                  className="ml-auto h-8 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => navigate({ to: "/payments-received/new", search: { partyId: invoice.customer_id, docId: invoice.id, amount: balanceDue } })}
                >
                  Record Payment
                </Button>
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
                  Invoice Details
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
                invoice={invoice}
                lines={lines ?? []}
                currency={currency}
                statusLabel={statusLabel}
                customerName={customerName}
                billing={billing}
                shipping={shipping}
                totals={totals}
                balanceDue={balanceDue}
                amountPaid={amountPaid}
                payments={payments ?? []}
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
  invoice,
  lines,
  currency,
  statusLabel,
  customerName,
  billing,
  shipping,
  totals,
  balanceDue,
  amountPaid,
  payments,
}: {
  invoice: any;
  lines: any[];
  currency: string;
  statusLabel: string;
  customerName: string;
  billing: string;
  shipping: string;
  totals: { subtotal: number; discountTotal: number; vatTotal: number; grandTotal: number };
  balanceDue: number;
  amountPaid: number;
  payments: any[];
}) {
  return (
    <>
      <div className="mb-8 flex items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{invoice.invoice_number}</h2>
        <Badge variant="secondary" className="font-normal capitalize">
          {statusLabel}
        </Badge>
      </div>
      <div className="-mt-6 mb-8 text-sm text-muted-foreground">
        Total :{" "}
        <span className="font-semibold text-foreground">
          {formatCurrency(totals.grandTotal, currency)}
        </span>
        {balanceDue > 0 && (
          <span className="ml-3">
            Balance Due :{" "}
            <span className="font-semibold text-rose-600">
              {formatCurrency(balanceDue, currency)}
            </span>
          </span>
        )}
      </div>

      <div className="mb-10 grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
        <Row label="Invoice Number" value={invoice.invoice_number} />
        <Row label="Invoice Date" value={formatDate(invoice.invoice_date)} />
        <Row
          label="Due Date"
          value={invoice.due_date ? formatDate(invoice.due_date) : "—"}
        />
        <Row label="Creation Date" value={formatDate(invoice.created_at)} />
        <Row label="PDF Template" value="NIMBUS" />
        <Row label="Salesperson" value="—" />
      </div>

      <h3 className="mb-4 text-base font-semibold">Bill To</h3>
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
                params={{ customerId: invoice.customer_id ?? "" }}
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
              {totals.discountTotal > 0
                ? `− ${formatCurrency(totals.discountTotal, currency)}`
                : formatCurrency(0, currency)}
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
          {amountPaid > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Amount Paid</span>
              <span className="tabular-nums">− {formatCurrency(amountPaid, currency)}</span>
            </div>
          )}
          <div className="flex justify-between rounded-md bg-emerald-50 px-2 py-1.5">
            <span className="font-semibold text-emerald-800">Balance Due</span>
            <span className="tabular-nums font-semibold text-emerald-800">
              {formatCurrency(balanceDue, currency)}
            </span>
          </div>
        </div>
      </div>

      {payments.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-3 text-base font-semibold">Payments</h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Date</th>
                  <th className="px-3 py-2.5 text-left font-medium">Method</th>
                  <th className="px-3 py-2.5 text-left font-medium">Reference</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2.5">{formatDate(p.payment_date)}</td>
                    <td className="px-3 py-2.5 capitalize">{(p.method ?? "—").replace("_", " ")}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.reference ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {formatCurrency(Number(p.amount ?? 0), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invoice.notes && (
        <div className="mt-10">
          <h3 className="mb-2 text-sm font-semibold">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</p>
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
  icon: "create" | "update" | "payment" | "status";
};

function buildActivity(invoice: any, payments: any[], actorName: string): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  events.push({
    id: "created",
    at: invoice.created_at,
    actor: actorName,
    title: `Created invoice ${invoice.invoice_number}`,
    icon: "create",
  });
  if (invoice.updated_at && invoice.updated_at !== invoice.created_at) {
    events.push({
      id: "updated",
      at: invoice.updated_at,
      actor: actorName,
      title: `Invoice updated`,
      description: `Status: ${invoice.status}`,
      icon: invoice.status === "paid" ? "status" : "update",
    });
  }
  for (const p of payments) {
    events.push({
      id: `payment-${p.id}`,
      at: p.payment_date ?? p.created_at,
      actor: actorName,
      title: `Payment received`,
      description: `${(p.method ?? "").replace("_", " ")} ${p.reference ? `· ${p.reference}` : ""}`,
      icon: "payment",
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
            {e.icon === "payment" && <Wallet className="h-3 w-3 text-emerald-600" />}
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
