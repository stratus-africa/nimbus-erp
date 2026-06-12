import { useState } from "react";
import { useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ArrowLeft, Edit, Send, Printer, MoreHorizontal, Paperclip,
  MessageSquare, X, Plus, Search, ChevronDown, RotateCcw,
} from "lucide-react";
import { DocActionsMenu } from "@/components/doc-actions-menu";
import type { PaymentsModuleConfig } from "@/components/payments-listing";

export function PaymentDetailPage({ config }: { config: PaymentsModuleConfig }) {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const tenant = profile?.currentTenant as any;
  const currency = tenant?.base_currency ?? "KES";
  const [sidebarSearch, setSidebarSearch] = useState("");

  const isReceived = config.kind === "received";
  const paramName = isReceived ? "paymentId" : "paymentId";
  const routeId = isReceived
    ? "/_authenticated/payments-received_/$paymentId"
    : "/_authenticated/payments-made_/$paymentId";
  const params = useParams({ strict: false }) as any;
  const paymentId = params[paramName] as string;

  const { data: allRows } = useQuery({
    enabled: !!tenantId,
    queryKey: [config.table, "sidebar", tenantId],
    queryFn: async () => {
      const partyJoin = isReceived ? "customers(name)" : "suppliers(name)";
      const docJoin = isReceived
        ? `invoices(${config.docNumberField}, ${partyJoin})`
        : `bills(${config.docNumberField}, ${partyJoin})`;
      const { data, error } = await supabase
        .from(config.table)
        .select(`id, payment_date, amount, method, reference, ${docJoin}`)
        .eq("tenant_id", tenantId!)
        .order("payment_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payment, isLoading } = useQuery({
    enabled: !!tenantId && !!paymentId,
    queryKey: [config.table, "detail", paymentId],
    queryFn: async () => {
      const partyJoin = isReceived
        ? "customers(id, name, billing_address, email, phone)"
        : "suppliers(id, name, address, email, phone)";
      const docJoin = isReceived
        ? `invoices(id, ${config.docNumberField}, invoice_date, total, ${partyJoin})`
        : `bills(id, ${config.docNumberField}, bill_date, total, ${partyJoin})`;
      const { data, error } = await supabase
        .from(config.table)
        .select(`*, ${docJoin}`)
        .eq("id", paymentId)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground">Loading payment…</div>;
  }
  if (!payment) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Payment not found.</p>
        <Button variant="outline" className="mt-4"
          onClick={() => navigate({ to: isReceived ? "/payments-received" : "/payments-made" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  const doc = payment[config.docTable];
  const party = doc?.[config.partyTable];
  const partyName = party?.name ?? "—";
  const partyId = party?.id;
  const docNumber = doc?.[config.docNumberField] ?? "—";
  const docDate = isReceived ? doc?.invoice_date : doc?.bill_date;
  const docTotal = Number(doc?.total ?? 0);
  const amount = Number(payment.amount ?? 0);

  const headerTitle = isReceived ? "Payment Received" : "Payment Made";
  const receiptTitle = isReceived ? "PAYMENT RECEIPT" : "PAYMENT VOUCHER";
  const partyHeading = isReceived ? "Received From" : "Paid To";
  const amountLabel = isReceived ? "Amount Received" : "Amount Paid";

  const filtered = (allRows ?? []).filter((r: any) => {
    if (!sidebarSearch) return true;
    const s = sidebarSearch.toLowerCase();
    const d = r[config.docTable];
    const p = d?.[config.partyTable];
    return (
      p?.name?.toLowerCase().includes(s) ||
      d?.[config.docNumberField]?.toLowerCase().includes(s) ||
      r.reference?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar */}
      <aside className="hidden w-[320px] shrink-0 flex-col border-r bg-card md:flex">
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder={`Search in ${config.title}`}
              className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <button className="inline-flex items-center gap-1 text-sm font-semibold">
            All {isReceived ? "Received Pa..." : "Made Pa..."} <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-1">
            <Button size="icon"
              className="h-7 w-7 bg-blue-500 text-white hover:bg-blue-600"
              onClick={() => navigate({ to: config.newRoute })}
              aria-label="New payment">
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((r: any, idx: number) => {
            const isActive = r.id === paymentId;
            const d = r[config.docTable];
            const p = d?.[config.partyTable];
            return (
              <button key={r.id}
                onClick={() => navigate({
                  to: isReceived ? "/payments-received/$paymentId" : "/payments-made/$paymentId",
                  params: { paymentId: r.id },
                } as any)}
                className={`w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                  isActive ? "border-l-2 border-l-blue-600 bg-blue-50/60" : ""
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold uppercase tracking-wide">
                      {p?.name ?? "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {filtered.length - idx} · {formatDate(r.payment_date)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs font-semibold tabular-nums">
                    {formatCurrency(Number(r.amount ?? 0), currency)}
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  <span className="font-semibold tracking-wide text-emerald-600">PAID</span>
                  <span className="text-muted-foreground">{r.method ?? "—"}</span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">No payments.</div>
          )}
        </div>
      </aside>

      {/* Main pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="border-b bg-card px-6 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">
                Location: <span className="font-medium text-foreground">Head Office</span>
              </div>
              <div className="mt-0.5 text-sm font-semibold">{filtered.findIndex((r: any) => r.id === paymentId) + 1 || ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8"><Paperclip className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MessageSquare className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon"
                className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => navigate({ to: isReceived ? "/payments-received" : "/payments-made" })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-6 py-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5">
            <Edit className="h-4 w-4" /> Edit
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5">
            <Send className="h-4 w-4" /> Send Email
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5">
            <Printer className="h-4 w-4" /> PDF/Print
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-rose-700 hover:bg-rose-50">
            <RotateCcw className="h-4 w-4" /> Refund
          </Button>
          <DocActionsMenu
            docId={paymentId}
            invalidateKeys={[
              config.table,
              `${config.table}-sidebar`,
              config.docTable,
              "bank_accounts",
              "bank_transactions",
              "journal_entries",
              "audit_logs",
            ]}
            config={{
              docTable: config.table,
              numberField: "reference",
              dateField: "payment_date",
              listRoute: isReceived ? "/payments-received" : "/payments-made",
              detailRoute: isReceived ? "/payments-received/$paymentId" : "/payments-made/$paymentId",
              detailParamKey: "paymentId",
              label: isReceived ? "Payment Received" : "Payment Made",
              hasLines: false,
              softDelete: false,
              deleteConfirm: {
                title: `Delete this ${isReceived ? "payment received" : "payment made"}?`,
                description:
                  "This action cannot be undone. The following will happen automatically:",
                impacts: isReceived
                  ? [
                      "The linked invoice's amount paid will decrease and balance due will be restored.",
                      "Invoice status will revert to Sent (or Partially Paid if other payments remain).",
                      "The matching bank deposit row will be removed from the bank account.",
                      "The associated ledger (journal) entry will be removed.",
                      "The bank account's current balance will be recomputed automatically.",
                      "An audit log entry will be written describing every change.",
                    ]
                  : [
                      "The linked bill's amount paid will decrease and balance due will be restored.",
                      "Bill status will revert to Open (or Partially Paid if other payments remain).",
                      "The matching bank withdrawal row will be removed from the bank account.",
                      "The associated ledger (journal) entry will be removed.",
                      "The bank account's current balance will be recomputed automatically.",
                      "An audit log entry will be written describing every change.",
                    ],
              },
            }}
          />
        </div>

        {/* Receipt body */}
        <div className="flex-1 overflow-auto bg-muted/20">
          <div className="mx-auto my-8 max-w-3xl">
            <div className="relative overflow-hidden rounded-md border bg-card shadow-sm">
              {/* Paid corner ribbon */}
              <div className="pointer-events-none absolute -left-12 top-6 w-44 -rotate-45 bg-emerald-500 py-1 text-center text-xs font-semibold uppercase tracking-wider text-white shadow">
                Paid
              </div>

              {/* Company header */}
              <div className="flex items-start justify-between gap-8 p-10 pb-6">
                <div className="flex items-start gap-4">
                  {tenant?.logo_url ? (
                    <img src={tenant.logo_url} alt="" className="h-12 w-auto" />
                  ) : (
                    <div className="grid h-12 w-12 place-items-center rounded bg-primary/10 text-sm font-bold text-primary">
                      {(tenant?.name ?? "N").charAt(0)}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs leading-relaxed text-muted-foreground">
                  <div className="text-sm font-semibold uppercase text-foreground">{tenant?.name}</div>
                  {tenant?.address && <div className="mt-1 whitespace-pre-wrap">{tenant.address}</div>}
                  {tenant?.tax_number && <div className="mt-1">PIN {tenant.tax_number}</div>}
                  {tenant?.phone && <div>{tenant.phone}</div>}
                  {tenant?.email && <div className="text-blue-600">{tenant.email}</div>}
                </div>
              </div>

              <div className="border-t" />

              {/* Title */}
              <div className="px-10 py-6 text-center">
                <div className="text-sm font-semibold tracking-[0.3em] text-foreground">{receiptTitle}</div>
              </div>

              {/* Payment meta + amount */}
              <div className="grid grid-cols-1 gap-6 px-10 pb-6 md:grid-cols-[1fr_auto]">
                <div className="space-y-3 text-sm">
                  <Row label="Payment Date" value={<span className="font-semibold">{formatDate(payment.payment_date)}</span>} />
                  <Row label="Reference Number" value={<span className="font-semibold">{payment.reference ?? "—"}</span>} />
                  <Row label="Payment Mode" value={<span className="font-semibold">{payment.method ?? "—"}</span>} />
                </div>
                <div className="grid place-items-center self-start rounded bg-emerald-600 px-6 py-4 text-center text-white">
                  <div className="text-[11px] uppercase tracking-wide opacity-90">{amountLabel}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {formatCurrency(amount, currency)}
                  </div>
                </div>
              </div>

              {/* Party block */}
              <div className="px-10 pb-8">
                <div className="text-xs text-muted-foreground">{partyHeading}</div>
                <Link
                  to={isReceived ? "/customers/$customerId" : "/suppliers/$supplierId"}
                  params={isReceived
                    ? { customerId: partyId ?? "" }
                    : { supplierId: partyId ?? "" }}
                  className="mt-1 inline-block text-sm font-semibold uppercase tracking-wide text-blue-600 hover:underline"
                >
                  {partyName}
                </Link>
              </div>

              <div className="border-t" />

              {/* Payment for */}
              <div className="px-10 py-6">
                <div className="mb-3 text-sm font-semibold">Payment for</div>
                <div className="overflow-hidden rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          {isReceived ? "Invoice Number" : "Bill Number"}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          {isReceived ? "Invoice Date" : "Bill Date"}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {isReceived ? "Invoice Amount" : "Bill Amount"}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">Payment Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="px-3 py-3">
                          {doc ? (
                            <Link
                              to={isReceived ? "/invoices/$invoiceId" : "/bills/$billId"}
                              params={isReceived
                                ? { invoiceId: doc.id }
                                : { billId: doc.id }}
                              className="text-blue-600 hover:underline"
                            >
                              {docNumber}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3">{docDate ? formatDate(docDate) : "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatCurrency(docTotal, currency)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium">
                          {formatCurrency(amount, currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {payment.notes && (
                <div className="border-t px-10 py-6">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Notes
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{payment.notes}</p>
                </div>
              )}

              <div className="border-t px-10 py-4 text-center text-xs text-muted-foreground">
                PDF Template : <span className="font-medium text-foreground">Nimbus</span>{" "}
                <button className="ml-1 text-blue-600 hover:underline">Change</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
