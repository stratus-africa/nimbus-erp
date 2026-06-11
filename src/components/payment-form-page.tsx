import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { X, RefreshCcw, Search, Calendar, Settings as SettingsIcon } from "lucide-react";
import type { PaymentsModuleConfig } from "@/components/payments-listing";
import { cn } from "@/lib/utils";

const METHODS = ["Cash", "Bank Transfer", "Card", "MPESA", "Cheque", "Other"];
const DEPOSIT_ACCOUNTS = ["MPESA", "Bank Account", "Cash", "Petty Cash"];

export function PaymentFormPage({ config }: { config: PaymentsModuleConfig }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";

  const [partyId, setPartyId] = useState<string>("");
  const [location, setLocation] = useState<string>("Head Office");
  const [amount, setAmount] = useState<string>("");
  const [bankCharges, setBankCharges] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentNo, setPaymentNo] = useState<string>("");
  const [method, setMethod] = useState<string>("Cash");
  const [depositTo, setDepositTo] = useState<string>("MPESA");
  const [reference, setReference] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const isReceived = config.kind === "received";

  // Fetch a draft payment number
  const { data: nextNumber } = useQuery({
    enabled: !!tenantId,
    queryKey: ["next_payment_no", config.table, tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from(config.table)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      const count = (data as any) ?? 0;
      return String((typeof count === "number" ? count : 0) + 1);
    },
  });
  useEffect(() => {
    if (nextNumber && !paymentNo) setPaymentNo(nextNumber);
  }, [nextNumber, paymentNo]);

  const { data: parties } = useQuery({
    enabled: !!tenantId,
    queryKey: [config.partyTable, tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from(config.partyTable)
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const { data: openDocs } = useQuery({
    enabled: !!tenantId && !!partyId,
    queryKey: [config.docTable, "open", partyId],
    queryFn: async () => {
      const partyField = config.docTable === "invoices" ? "customer_id" : "supplier_id";
      const { data, error } = await (supabase as any)
        .from(config.docTable)
        .select(
          `id, ${config.docNumberField}, total, amount_paid, balance_due, status, issue_date, created_at`,
        )
        .eq("tenant_id", tenantId!)
        .eq(partyField, partyId)
        .is("deleted_at", null)
        .gt("balance_due", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    setAllocations({});
  }, [partyId]);

  const amountReceived = Number(amount) || 0;
  const amountUsed = useMemo(
    () =>
      Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [allocations],
  );
  const amountExcess = Math.max(0, amountReceived - amountUsed);
  const partyName = useMemo(
    () => parties?.find((p: any) => p.id === partyId)?.name ?? "",
    [parties, partyId],
  );

  const save = useMutation({
    mutationFn: async (asDraft: boolean) => {
      if (!tenantId) throw new Error("No tenant");
      if (!partyId) throw new Error(`Select a ${config.partyLabel.toLowerCase()}`);
      if (!(amountReceived > 0)) throw new Error("Amount must be greater than 0");

      const entries = Object.entries(allocations)
        .map(([id, v]) => [id, Number(v) || 0] as const)
        .filter(([, v]) => v > 0);

      if (!asDraft && entries.length === 0)
        throw new Error("Allocate the payment to at least one " + (isReceived ? "invoice" : "bill"));
      if (amountUsed > amountReceived + 0.001)
        throw new Error("Allocated amount exceeds amount received");

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      const noteHeader =
        `Payment #${paymentNo}` +
        (location ? ` • Location: ${location}` : "") +
        (depositTo ? ` • Deposit to: ${depositTo}` : "") +
        (bankCharges ? ` • Bank charges: ${bankCharges}` : "") +
        (asDraft ? " • DRAFT" : "");

      for (const [docId, amt] of entries) {
        const { error: pe } = await supabase.from(config.table).insert({
          tenant_id: tenantId,
          [config.docFk]: docId,
          payment_date: date,
          amount: amt,
          method: method.toLowerCase().replace(/\s+/g, "_"),
          reference: reference || null,
          notes: noteHeader,
          created_by: uid ?? null,
        } as any);
        if (pe) throw pe;

        if (!asDraft) {
          const doc = openDocs!.find((d: any) => d.id === docId)!;
          const newPaid = Number(doc.amount_paid ?? 0) + amt;
          const newBalance = Number(doc.total ?? 0) - newPaid;
          const newStatus = newBalance <= 0.001 ? "paid" : "partially_paid";
          const { error: ue } = await supabase
            .from(config.docTable)
            .update({
              amount_paid: newPaid,
              balance_due: Math.max(0, newBalance),
              status: newStatus,
            })
            .eq("id", docId);
          if (ue) throw ue;
        }
      }
    },
    onSuccess: (_d, asDraft) => {
      toast.success(asDraft ? "Payment saved as draft" : "Payment recorded");
      qc.invalidateQueries({ queryKey: [config.table] });
      qc.invalidateQueries({ queryKey: [config.docTable] });
      navigate({ to: isReceived ? "/payments-received" : "/payments-made" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to record payment"),
  });

  const backTo = isReceived ? "/payments-received" : "/payments-made";

  const setAlloc = (id: string, v: string) =>
    setAllocations((prev) => ({ ...prev, [id]: v }));

  const clearAllocations = () => setAllocations({});

  return (
    <div className="-m-6 flex h-full flex-col bg-background">
      {/* Top utility bar */}
      <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-2">
        <button
          className="text-muted-foreground hover:text-foreground"
          aria-label="Refresh"
          onClick={() => qc.invalidateQueries()}
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
        <div className="flex h-8 max-w-md flex-1 items-center gap-2 rounded-md border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            disabled
            placeholder={`Search in ${config.title} ( / )`}
            className="h-7 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-3">
        <h1 className="text-lg font-semibold">Record Payment</h1>
        <button
          onClick={() => navigate({ to: backTo })}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Customer/Vendor highlighted strip */}
        <div className="bg-muted/40 px-6 py-5 border-b">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-center">
            <Label className="text-rose-600">{config.partyLabel} Name*</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger className="max-w-md border-primary/40">
                <SelectValue placeholder={`Select ${config.partyLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {parties?.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {partyName && (
              <div className="rounded bg-slate-800 text-white text-xs px-3 py-2 cursor-pointer">
                {partyName}'s Details ›
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr] sm:items-center max-w-3xl">
            <Label>Location</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="max-w-md border-primary/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Head Office">Head Office</SelectItem>
                <SelectItem value="Branch">Branch</SelectItem>
              </SelectContent>
            </Select>

            <Label className="text-rose-600">Amount {isReceived ? "Received" : "Paid"}*</Label>
            <div className="flex max-w-md">
              <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                {currency}
              </span>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-l-none"
                placeholder="0.00"
              />
            </div>

            <Label>Bank Charges (if any)</Label>
            <Input
              type="number"
              step="0.01"
              value={bankCharges}
              onChange={(e) => setBankCharges(e.target.value)}
              className="max-w-md"
            />

            <Label className="text-rose-600">Payment Date*</Label>
            <div className="relative max-w-md">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>

            <Label className="text-rose-600">Payment #*</Label>
            <div className="relative max-w-md">
              <Input
                value={paymentNo}
                onChange={(e) => setPaymentNo(e.target.value)}
                className="bg-muted/40"
              />
              <SettingsIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            </div>

            <Label>Payment Mode</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label className="text-rose-600">Deposit To*</Label>
            <Select value={depositTo} onValueChange={setDepositTo}>
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPOSIT_ACCOUNTS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Reference#</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="max-w-md"
            />
          </div>

          {/* Unpaid invoices/bills */}
          <div className="mt-8">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">
                  Unpaid {isReceived ? "Invoices" : "Bills"}
                </h2>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Filter by Date Range
                </Button>
              </div>
              <button
                onClick={clearAllocations}
                className="text-sm text-primary hover:underline"
                disabled={!Object.keys(allocations).length}
              >
                Clear Applied Amount
              </button>
            </div>

            <div className="rounded border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">
                      {isReceived ? "Invoice" : "Bill"} Number
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Location</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {isReceived ? "Invoice" : "Bill"} Amount
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Amount Due</th>
                    <th className="px-3 py-2 text-right font-medium">Withholding Tax</th>
                    <th className="px-3 py-2 text-right font-medium">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {!partyId ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Select a {config.partyLabel.toLowerCase()} to see unpaid {isReceived ? "invoices" : "bills"}.
                      </td>
                    </tr>
                  ) : (openDocs ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        There are no unpaid {isReceived ? "invoices" : "bills"} associated with this {config.partyLabel.toLowerCase()}.
                      </td>
                    </tr>
                  ) : (
                    (openDocs ?? []).map((d: any) => {
                      const due = Number(d.balance_due ?? 0);
                      const val = allocations[d.id] ?? "";
                      return (
                        <tr key={d.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2 align-middle whitespace-nowrap">
                            {formatDate(d.issue_date ?? d.created_at)}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            {d[config.docNumberField]}
                          </td>
                          <td className="px-3 py-2 align-middle text-muted-foreground">{location}</td>
                          <td className="px-3 py-2 align-middle text-right tabular-nums">
                            {formatCurrency(Number(d.total ?? 0), currency)}
                          </td>
                          <td className="px-3 py-2 align-middle text-right tabular-nums">
                            {formatCurrency(due, currency)}
                          </td>
                          <td className="px-3 py-2 align-middle text-right tabular-nums text-muted-foreground">
                            0.00
                          </td>
                          <td className="px-3 py-2 align-middle text-right">
                            <Input
                              type="number"
                              step="0.01"
                              value={val}
                              onChange={(e) => setAlloc(d.id, e.target.value)}
                              max={due}
                              className="h-8 ml-auto w-32 text-right"
                              placeholder="0.00"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 text-sm">
                    <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={4}>
                      **List contains only SENT {isReceived ? "invoices" : "bills"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(
                        (openDocs ?? []).reduce(
                          (s: number, d: any) => s + Number(d.balance_due ?? 0),
                          0,
                        ),
                        currency,
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(amountUsed, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Summary box */}
            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-sm rounded-md bg-muted/40 p-4 text-sm space-y-2">
                <Row label="Amount Received :" value={formatCurrency(amountReceived, currency)} />
                <Row label="Amount used for Payments :" value={formatCurrency(amountUsed, currency)} />
                <Row label="Amount Refunded :" value={formatCurrency(0, currency)} />
                <Row
                  label="Amount in Excess:"
                  value={`${currency} ${amountExcess.toFixed(2)}`}
                  highlight={amountExcess > 0}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t bg-card px-6 py-3">
        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => save.mutate(true)}
        >
          Save as Draft
        </Button>
        <Button
          disabled={save.isPending}
          onClick={() => save.mutate(false)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {save.isPending ? "Saving…" : "Save as Paid"}
        </Button>
        <Button variant="ghost" onClick={() => navigate({ to: backTo })}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(highlight && "flex items-center gap-1 text-rose-600 font-medium")}>
        {highlight && <span className="text-rose-600">⚠</span>}
        {label}
      </span>
      <span className={cn("tabular-nums", highlight && "text-rose-600 font-medium")}>{value}</span>
    </div>
  );
}
