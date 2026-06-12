import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { X, RefreshCcw, Search, Calendar, Settings as SettingsIcon } from "lucide-react";
import type { PaymentsModuleConfig } from "@/components/payments-listing";
import { cn } from "@/lib/utils";

const METHODS = ["Cash", "Bank Transfer", "Card", "MPESA", "Cheque", "Other"];

export function PaymentFormPage({ config }: { config: PaymentsModuleConfig }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const isReceived = config.kind === "received";

  // Prefill from query string (?partyId=...&docId=...&amount=...)
  const search = useSearch({ strict: false }) as {
    partyId?: string;
    docId?: string;
    amount?: number;
  };

  const [partyId, setPartyId] = useState<string>(search.partyId ?? "");
  const [location, setLocation] = useState<string>("Head Office");
  const [amount, setAmount] = useState<string>(
    search.amount != null ? String(search.amount) : "",
  );
  const [bankCharges, setBankCharges] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentNo, setPaymentNo] = useState<string>("");
  const [method, setMethod] = useState<string>("Cash");
  const [depositTo, setDepositTo] = useState<string>(""); // bank_accounts.id
  const [reference, setReference] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [prefilledDocId, setPrefilledDocId] = useState<string | undefined>(search.docId);
  const [excessConfirm, setExcessConfirm] = useState<null | { asDraft: boolean }>(null);

  // Cash/Bank accounts from the Banking module (synced with Chart of Accounts)
  const { data: bankAccounts = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["bank_accounts_for_payment", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts" as any)
        .select("id, account_name, account_type, currency, coa_account_id, current_balance, is_active")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .in("account_type", ["cash", "bank"])
        .order("account_name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
  useEffect(() => {
    if (!depositTo && bankAccounts.length > 0) setDepositTo(bankAccounts[0].id);
  }, [bankAccounts, depositTo]);
  const selectedBankAcct = useMemo(
    () => bankAccounts.find((b: any) => b.id === depositTo),
    [bankAccounts, depositTo],
  );
  const depositLabel = isReceived ? "Deposit To" : "Paid Through";

  // Draft payment number
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
      const dateField = config.docTable === "invoices" ? "invoice_date" : "bill_date";
      const { data, error } = await (supabase as any)
        .from(config.docTable)
        .select(
          `id, ${config.docNumberField}, total, amount_paid, balance_due, status, ${dateField}, created_at`,
        )
        .eq("tenant_id", tenantId!)
        .eq(partyField, partyId)
        .is("deleted_at", null)
        .gt("balance_due", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((d: any) => ({ ...d, issue_date: d[dateField] })) as any[];
    },
  });

  // Reset allocations only when party actually changes (not on first prefill)
  useEffect(() => {
    setAllocations({});
  }, [partyId]);

  // When prefilled doc loads, set its allocation to amount or balance_due
  useEffect(() => {
    if (!prefilledDocId || !openDocs) return;
    const doc = openDocs.find((d: any) => d.id === prefilledDocId);
    if (!doc) return;
    const due = Number(doc.balance_due ?? 0);
    const prefAmt = search.amount != null ? Number(search.amount) : due;
    const apply = Math.min(due, prefAmt);
    setAllocations((prev) => ({ ...prev, [prefilledDocId]: apply.toFixed(2) }));
    setPrefilledDocId(undefined);
  }, [prefilledDocId, openDocs, search.amount]);

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

  // Validation: any per-row over-allocation?
  const overAllocations = useMemo(() => {
    const list = openDocs ?? [];
    return list
      .map((d: any) => {
        const val = Number(allocations[d.id] ?? 0);
        const due = Number(d.balance_due ?? 0);
        return val > due + 0.001
          ? { id: d.id, number: d[config.docNumberField], val, due }
          : null;
      })
      .filter(Boolean) as { id: string; number: string; val: number; due: number }[];
  }, [allocations, openDocs, config.docNumberField]);

  // Per-row clamp on change
  const setAlloc = (id: string, v: string, max: number) => {
    let val = v;
    const n = Number(v);
    if (Number.isFinite(n) && n > max) {
      val = max.toFixed(2);
      toast.warning(
        `Cannot apply more than the balance due (${formatCurrency(max, currency)})`,
      );
    }
    setAllocations((prev) => ({ ...prev, [id]: val }));
  };

  const clearAllocations = () => setAllocations({});

  // Find or create a CoA account by code
  const getOrCreateAccount = async (
    code: string,
    name: string,
    type: "asset" | "liability" | "income" | "expense" | "equity",
  ): Promise<string> => {
    const { data: found } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("tenant_id", tenantId!)
      .eq("code", code)
      .maybeSingle();
    if (found?.id) return found.id;
    const { data: ins, error } = await supabase
      .from("chart_of_accounts")
      .insert({ tenant_id: tenantId!, code, name, account_type: type })
      .select("id")
      .single();
    if (error) throw error;
    return ins!.id;
  };

  const save = useMutation({
    mutationFn: async (opts: { asDraft: boolean; confirmedExcess?: boolean }) => {
      const { asDraft } = opts;
      if (!tenantId) throw new Error("No tenant");
      if (!partyId) throw new Error(`Select a ${config.partyLabel.toLowerCase()}`);
      if (!(amountReceived > 0)) throw new Error("Amount must be greater than 0");
      if (overAllocations.length > 0) {
        throw new Error(
          `Allocation exceeds balance due on ${overAllocations.map((o) => o.number).join(", ")}`,
        );
      }
      if (amountUsed > amountReceived + 0.001)
        throw new Error("Allocated amount exceeds amount received");

      const entries = Object.entries(allocations)
        .map(([id, v]) => [id, Number(v) || 0] as const)
        .filter(([, v]) => v > 0);

      if (!asDraft && entries.length === 0 && amountExcess <= 0)
        throw new Error("Allocate the payment to at least one " + (isReceived ? "invoice" : "bill"));

      // Excess confirmation gate
      if (!asDraft && amountExcess > 0.001 && !opts.confirmedExcess) {
        setExcessConfirm({ asDraft });
        return { aborted: true as const };
      }

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const { data: actorProfile } = uid
        ? await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("user_id", uid)
            .maybeSingle()
        : { data: null as any };
      const actorName =
        actorProfile?.full_name ?? actorProfile?.email ?? "System";

      const noteHeader =
        `Payment #${paymentNo}` +
        (location ? ` • Location: ${location}` : "") +
        (depositTo ? ` • Deposit to: ${depositTo}` : "") +
        (bankCharges ? ` • Bank charges: ${bankCharges}` : "") +
        (asDraft ? " • DRAFT" : "");

      const paymentIds: string[] = [];
      const appliedDocs: { id: string; number: string; amount: number }[] = [];

      for (const [docId, amt] of entries) {
        const doc = openDocs!.find((d: any) => d.id === docId)!;
        const { data: insPay, error: pe } = await supabase
          .from(config.table)
          .insert({
            tenant_id: tenantId,
            [config.docFk]: docId,
            payment_date: date,
            amount: amt,
            method: method.toLowerCase().replace(/\s+/g, "_"),
            reference: reference || null,
            notes: noteHeader,
            created_by: uid ?? null,
          } as any)
          .select("id")
          .single();
        if (pe) throw pe;
        paymentIds.push(insPay!.id);
        appliedDocs.push({ id: docId, number: doc[config.docNumberField], amount: amt });

        if (!asDraft) {
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

      let journalId: string | null = null;
      let creditId: string | null = null;

      // Post journal & excess credit only when finalising
      if (!asDraft) {
        // Resolve accounts — depositTo is now a bank_accounts.id linked to a CoA ledger
        if (!selectedBankAcct) throw new Error(`Select a ${depositLabel.toLowerCase()} account`);
        let depositAcct = (selectedBankAcct as any).coa_account_id as string | null;
        if (!depositAcct) {
          depositAcct = await getOrCreateAccount(
            (selectedBankAcct as any).account_type === "cash" ? "1000" : "1010",
            (selectedBankAcct as any).account_name,
            "asset",
          );
        }
        const contraCode = isReceived ? "1200" : "2000";
        const contraName = isReceived ? "Accounts Receivable" : "Accounts Payable";
        const contraType: "asset" | "liability" = isReceived ? "asset" : "liability";
        const contraAcct = await getOrCreateAccount(contraCode, contraName, contraType);

        let advAcct: string | null = null;
        if (amountExcess > 0.001) {
          if (isReceived) {
            advAcct = await getOrCreateAccount("2150", "Customer Advances", "liability");
          } else {
            advAcct = await getOrCreateAccount("1450", "Supplier Advances", "asset");
          }
        }

        // Journal entry number
        const { data: jnum } = await supabase.rpc("next_doc_number", {
          _tenant: tenantId,
          _doc_type: "journal",
        });
        const entryNumber = (jnum as any) ?? `JE-${Date.now()}`;

        const totalAllocated = entries.reduce((s, [, v]) => s + v, 0);
        const description = `${isReceived ? "Payment received" : "Payment made"} #${paymentNo} — ${partyName}`;

        const { data: je, error: jeErr } = await supabase
          .from("journal_entries")
          .insert({
            tenant_id: tenantId,
            entry_number: entryNumber,
            entry_date: date,
            reference: reference || paymentNo,
            description,
            total_debit: amountReceived,
            total_credit: amountReceived,
            source_type: config.table,
            source_id: paymentIds[0] ?? null,
            created_by: uid ?? null,
          })
          .select("id")
          .single();
        if (jeErr) throw jeErr;
        journalId = je!.id;

        // Lines
        const lines: any[] = [];
        if (isReceived) {
          // Dr Deposit (amountReceived), Cr AR (totalAllocated), Cr CustAdvances (excess)
          lines.push({
            entry_id: journalId,
            account_id: depositAcct,
            description: `Receipt to ${depositTo}`,
            debit: amountReceived,
            credit: 0,
            position: 0,
          });
          if (totalAllocated > 0)
            lines.push({
              entry_id: journalId,
              account_id: contraAcct,
              description: "AR settled",
              debit: 0,
              credit: totalAllocated,
              position: 1,
            });
          if (amountExcess > 0 && advAcct)
            lines.push({
              entry_id: journalId,
              account_id: advAcct,
              description: "Customer advance (overpayment)",
              debit: 0,
              credit: amountExcess,
              position: 2,
            });
        } else {
          // Dr AP (allocated), Dr SupplierAdvances (excess), Cr Deposit (amountReceived)
          if (totalAllocated > 0)
            lines.push({
              entry_id: journalId,
              account_id: contraAcct,
              description: "AP settled",
              debit: totalAllocated,
              credit: 0,
              position: 0,
            });
          if (amountExcess > 0 && advAcct)
            lines.push({
              entry_id: journalId,
              account_id: advAcct,
              description: "Supplier advance (prepayment)",
              debit: amountExcess,
              credit: 0,
              position: 1,
            });
          lines.push({
            entry_id: journalId,
            account_id: depositAcct,
            description: `Paid from ${depositTo}`,
            debit: 0,
            credit: amountReceived,
            position: 2,
          });
        }
        const { error: lineErr } = await supabase.from("journal_lines").insert(lines);
        if (lineErr) throw lineErr;

        // Excess → credits
        if (amountExcess > 0.001) {
          const creditTable = isReceived ? "customer_credits" : "supplier_credits";
          const partyFk = isReceived ? "customer_id" : "supplier_id";
          const { data: credIns, error: cErr } = await (supabase as any)
            .from(creditTable)
            .insert({
              tenant_id: tenantId,
              [partyFk]: partyId,
              source: "overpayment",
              issue_date: date,
              currency,
              amount: amountExcess,
              balance: amountExcess,
              reference: paymentNo,
              memo: `Excess from payment #${paymentNo}`,
              created_by: uid ?? null,
            })
            .select("id")
            .single();
          if (cErr) throw cErr;
          creditId = credIns!.id;
        }
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_id: uid ?? null,
        actor_name: actorName,
        entity_type: config.table,
        entity_id: paymentIds[0] ?? null,
        action: asDraft ? "payment_draft" : "payment_posted",
        summary: `${actorName} ${asDraft ? "drafted" : "recorded"} ${isReceived ? "payment received" : "payment made"} #${paymentNo} of ${formatCurrency(amountReceived, currency)} from ${partyName}`,
        details: {
          payment_no: paymentNo,
          kind: config.kind,
          party_id: partyId,
          party_name: partyName,
          amount: amountReceived,
          allocated: amountUsed,
          excess: amountExcess,
          method,
          deposit_to: depositTo,
          location,
          bank_charges: Number(bankCharges) || 0,
          reference: reference || null,
          date,
          applied: appliedDocs,
          payment_ids: paymentIds,
          journal_entry_id: journalId,
          credit_id: creditId,
          status: asDraft ? "draft" : "posted",
        },
      });

      return { aborted: false as const, asDraft };
    },
    onSuccess: (res) => {
      if (!res || (res as any).aborted) return;
      const asDraft = (res as any).asDraft;
      toast.success(asDraft ? "Payment saved as draft" : "Payment recorded & posted to ledger");
      qc.invalidateQueries({ queryKey: [config.table] });
      qc.invalidateQueries({ queryKey: [config.docTable] });
      qc.invalidateQueries({ queryKey: ["audit_logs"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      navigate({ to: isReceived ? "/payments-received" : "/payments-made" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to record payment"),
  });

  const backTo = isReceived ? "/payments-received" : "/payments-made";

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
        {/* Party strip */}
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
                      const over = Number(val) > due + 0.001;
                      return (
                        <tr key={d.id} className={cn("border-b last:border-b-0", over && "bg-rose-50")}>
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
                              onChange={(e) => setAlloc(d.id, e.target.value, due)}
                              max={due}
                              className={cn(
                                "h-8 ml-auto w-32 text-right",
                                over && "border-rose-500 focus-visible:ring-rose-500",
                              )}
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
                  label={amountExcess > 0 ? "Excess → will be saved as credit:" : "Amount in Excess:"}
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
          onClick={() => save.mutate({ asDraft: true })}
        >
          Save as Draft
        </Button>
        <Button
          disabled={save.isPending || overAllocations.length > 0}
          onClick={() => save.mutate({ asDraft: false })}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {save.isPending ? "Saving…" : "Save as Paid"}
        </Button>
        <Button variant="ghost" onClick={() => navigate({ to: backTo })}>
          Cancel
        </Button>
      </div>

      {/* Excess confirmation dialog */}
      <AlertDialog
        open={!!excessConfirm}
        onOpenChange={(open) => !open && setExcessConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save excess as a credit?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatCurrency(amountExcess, currency)} is unallocated. This will be
              recorded as an {isReceived ? "open customer credit" : "open supplier prepayment"}{" "}
              for <span className="font-medium">{partyName}</span> and posted to the
              ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const opts = excessConfirm!;
                setExcessConfirm(null);
                save.mutate({ asDraft: opts.asDraft, confirmedExcess: true });
              }}
            >
              Confirm & Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
