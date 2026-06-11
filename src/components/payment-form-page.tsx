import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { FileText, X } from "lucide-react";
import type { PaymentsModuleConfig } from "@/components/payments-listing";

const METHODS = ["cash", "bank_transfer", "card", "mobile_money", "cheque", "other"];

export function PaymentFormPage({ config }: { config: PaymentsModuleConfig }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";

  const [partyId, setPartyId] = useState<string>("");
  const [docId, setDocId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

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
        .select(`id, ${config.docNumberField}, total, amount_paid, balance_due, status`)
        .eq("tenant_id", tenantId!)
        .eq(partyField, partyId)
        .is("deleted_at", null)
        .gt("balance_due", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Reset doc when party changes.
  useEffect(() => {
    setDocId("");
  }, [partyId]);

  const selectedDoc = useMemo(
    () => (openDocs ?? []).find((d: any) => d.id === docId),
    [openDocs, docId],
  );
  const balance = Number(selectedDoc?.balance_due ?? 0);

  // Default amount = balance due when doc picked.
  useEffect(() => {
    if (selectedDoc && !amount) setAmount(String(balance));
  }, [selectedDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      if (!docId) throw new Error("Select an invoice/bill");
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Amount must be greater than 0");
      if (amt > balance + 0.001) throw new Error("Amount exceeds balance due");

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      const { error: pe } = await supabase.from(config.table).insert({
        tenant_id: tenantId,
        [config.docFk]: docId,
        payment_date: date,
        amount: amt,
        method,
        reference: reference || null,
        notes: notes || null,
        created_by: uid ?? null,
      } as any);
      if (pe) throw pe;

      const newPaid = Number(selectedDoc!.amount_paid ?? 0) + amt;
      const newBalance = Number(selectedDoc!.total ?? 0) - newPaid;
      const newStatus =
        newBalance <= 0.001
          ? config.docTable === "invoices"
            ? "paid"
            : "paid"
          : config.docTable === "invoices"
          ? "partially_paid"
          : "partially_paid";

      const { error: ue } = await supabase
        .from(config.docTable)
        .update({
          amount_paid: newPaid,
          balance_due: Math.max(0, newBalance),
          status: newStatus,
        })
        .eq("id", docId);
      if (ue) throw ue;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: [config.table] });
      qc.invalidateQueries({ queryKey: [config.docTable] });
      navigate({ to: config.newRoute === "/payments-received/new" ? "/payments-received" : "/payments-made" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to record payment"),
  });

  const backTo =
    config.newRoute === "/payments-received/new" ? "/payments-received" : "/payments-made";

  return (
    <div className="-m-6 flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">
            Record {config.kind === "received" ? "Payment Received" : "Payment Made"}
          </h1>
        </div>
        <button
          onClick={() => navigate({ to: backTo })}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
            <Label className="text-rose-600">{config.partyLabel} *</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger className="max-w-md">
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

            <Label className="text-rose-600">
              {config.docTable === "invoices" ? "Invoice" : "Bill"} *
            </Label>
            <Select value={docId} onValueChange={setDocId} disabled={!partyId}>
              <SelectTrigger className="max-w-md">
                <SelectValue
                  placeholder={
                    partyId
                      ? `Select open ${config.docTable === "invoices" ? "invoice" : "bill"}`
                      : `Select ${config.partyLabel.toLowerCase()} first`
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(openDocs ?? []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d[config.docNumberField]} — Balance{" "}
                    {formatCurrency(Number(d.balance_due ?? 0), currency)}
                  </SelectItem>
                ))}
                {(openDocs ?? []).length === 0 && partyId && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No open {config.docTable === "invoices" ? "invoices" : "bills"}.
                  </div>
                )}
              </SelectContent>
            </Select>

            <Label>Payment Date *</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-md"
            />

            <Label>Amount *</Label>
            <div className="flex flex-col gap-1">
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="max-w-md"
                placeholder="0.00"
              />
              {selectedDoc && (
                <p className="text-xs text-muted-foreground">
                  Balance due: {formatCurrency(balance, currency)}
                </p>
              )}
            </div>

            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">
                    {m.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Reference #</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="max-w-md"
              placeholder="Transaction id, cheque #, etc."
            />

            <Label className="self-start pt-2">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="max-w-md"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-card px-6 py-3">
        <div className="flex items-center gap-2">
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {save.isPending ? "Saving…" : "Save Payment"}
          </Button>
          <Button variant="ghost" onClick={() => navigate({ to: backTo })}>
            Cancel
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          Total:{" "}
          <span className="font-semibold text-foreground">
            {formatCurrency(Number(amount) || 0, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
