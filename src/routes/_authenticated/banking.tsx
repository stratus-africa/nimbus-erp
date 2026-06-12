import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Landmark, Wallet, CheckCircle2, CreditCard, Plus, ChevronDown, Search,
  Upload, Settings as SettingsIcon, Banknote, MoreHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/banking")({
  head: () => ({ meta: [{ title: "Banking — Nimbus ERP" }] }),
  component: BankingPage,
});

type BankAccount = {
  id: string;
  account_name: string;
  account_type: "cash" | "bank" | "credit_card" | "payment_clearing";
  bank_name: string | null;
  account_number: string | null;
  currency: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
};

const CURRENCIES = ["KES", "USD", "EUR", "GBP", "UGX", "TZS"];

const TYPE_LABEL: Record<BankAccount["account_type"], string> = {
  cash: "Cash",
  bank: "Bank",
  credit_card: "Credit Card",
  payment_clearing: "Payment Clearing",
};

function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
    }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toFixed(2)}`;
  }
}

function BankingPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const baseCurrency = profile?.currentTenant?.base_currency ?? "KES";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank_accounts", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase
        .from("bank_accounts" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) as BankAccount[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      [a.account_name, a.bank_name, a.account_number].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [accounts, query]);

  const totals = useMemo(() => {
    const sum = (pred: (a: BankAccount) => boolean) =>
      accounts.filter(pred).reduce((s, a) => s + Number(a.current_balance || 0), 0);
    return {
      cash: sum((a) => a.account_type === "cash" && a.is_active),
      clearing: sum((a) => a.account_type === "payment_clearing" && a.is_active),
      bank: sum((a) => a.account_type === "bank" && a.is_active),
      card: sum((a) => a.account_type === "credit_card" && a.is_active),
    };
  }, [accounts]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_accounts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account deleted");
      qc.invalidateQueries({ queryKey: ["bank_accounts", tenantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("bank_accounts" as any).update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts", tenantId] });
    },
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <h1 className="text-xl font-semibold">Banking Overview</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="text-sm text-primary hover:underline">
            Auto-upload bank statements from email
          </button>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Upload className="h-4 w-4" /> Import Statement
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-9 gap-2 bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="h-4 w-4" /> Add Bank or Credit Card
              </Button>
            </DialogTrigger>
            <AddAccountDialog
              tenantId={tenantId}
              defaultCurrency={baseCurrency}
              onClose={() => setOpen(false)}
            />
          </Dialog>
          <Button variant="outline" size="sm" className="h-9">Manage Transaction Rules</Button>
        </div>
      </div>

      {/* Summary card */}
      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between p-5 pb-3">
          <button className="text-base font-semibold inline-flex items-center gap-1">
            All Accounts <ChevronDown className="h-4 w-4" />
          </button>
          <button className="text-sm text-muted-foreground inline-flex items-center gap-1">
            Last 30 days <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-5 pb-5">
          <StatTile icon={Wallet} tone="indigo" label="Cash In Hand" value={formatMoney(totals.cash, baseCurrency)} />
          <StatTile icon={CheckCircle2} tone="sky" label="Payment Clearing" value={formatMoney(totals.clearing, baseCurrency)} />
          <StatTile icon={Landmark} tone="emerald" label="Bank Balance" value={formatMoney(totals.bank, baseCurrency)} />
          <StatTile icon={CreditCard} tone="violet" label="Card Balance" value={formatMoney(totals.card, baseCurrency)} />
        </div>
        <div className="border-t px-5 py-3">
          <button className="text-sm text-primary inline-flex items-center gap-1">
            Show Chart <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </section>

      {/* Accounts list */}
      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between p-4 border-b">
          <button className="text-base font-semibold inline-flex items-center gap-1">
            All Accounts <ChevronDown className="h-4 w-4" />
          </button>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts"
              className="h-9 pl-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_40px] items-center gap-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
          <div>Account Details</div>
          <div>Type</div>
          <div className="text-right">Amount in Bank</div>
          <div className="text-right">Amount in Books</div>
          <div />
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Banknote className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              {query ? `No accounts match "${query}"` : "No accounts yet. Add your first bank or cash account."}
            </p>
            {!query && (
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => setOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Bank or Credit Card
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate({ to: "/banking/$accountId", params: { accountId: a.id } })}
                className={cn(
                  "grid grid-cols-[1.5fr_1fr_1fr_1fr_40px] items-center gap-3 px-5 py-3 hover:bg-muted/30 cursor-pointer",
                  !a.is_active && "opacity-60",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "grid h-9 w-9 place-items-center rounded-md shrink-0",
                    a.account_type === "cash" && "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40",
                    a.account_type === "bank" && "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40",
                    a.account_type === "credit_card" && "bg-violet-50 text-violet-600 dark:bg-violet-950/40",
                    a.account_type === "payment_clearing" && "bg-sky-50 text-sky-600 dark:bg-sky-950/40",
                  )}>
                    {a.account_type === "cash" && <Wallet className="h-4 w-4" />}
                    {a.account_type === "bank" && <Landmark className="h-4 w-4" />}
                    {a.account_type === "credit_card" && <CreditCard className="h-4 w-4" />}
                    {a.account_type === "payment_clearing" && <CheckCircle2 className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-primary truncate">{a.account_name}</div>
                    {a.account_number && (
                      <div className="text-xs text-muted-foreground">
                        xxxx{a.account_number.slice(-4)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-sm text-foreground/80">
                  {TYPE_LABEL[a.account_type]}
                  {a.bank_name && <div className="text-xs text-muted-foreground truncate">{a.bank_name}</div>}
                </div>
                <div className="text-right text-sm tabular-nums">
                  {formatMoney(0, a.currency)}
                </div>
                <div className="text-right text-sm tabular-nums">
                  {formatMoney(Number(a.current_balance || 0), a.currency)}
                </div>
                <div className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toggleActive.mutate({ id: a.id, is_active: !a.is_active })}>
                        Mark as {a.is_active ? "Inactive" : "Active"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete "${a.account_name}"?`)) remove.mutate(a.id);
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({
  icon: Icon, tone, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "indigo" | "sky" | "emerald" | "violet";
  label: string;
  value: string;
}) {
  const toneClass = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  }[tone];
  return (
    <div className="flex items-center gap-3">
      <div className={cn("grid h-10 w-10 place-items-center rounded-md", toneClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-base font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function AddAccountDialog({
  tenantId, defaultCurrency, onClose,
}: { tenantId: string | undefined; defaultCurrency: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    account_name: "",
    account_type: "bank" as BankAccount["account_type"],
    bank_name: "",
    account_number: "",
    currency: defaultCurrency || "KES",
    opening_balance: "0",
    description: "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      if (!form.account_name.trim()) throw new Error("Account name is required");
      const ob = Number(form.opening_balance) || 0;
      const { error } = await supabase.from("bank_accounts" as any).insert({
        tenant_id: tenantId,
        account_name: form.account_name.trim(),
        account_type: form.account_type,
        bank_name: form.bank_name.trim() || null,
        account_number: form.account_number.trim() || null,
        currency: form.currency,
        opening_balance: ob,
        current_balance: ob,
        description: form.description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account added");
      qc.invalidateQueries({ queryKey: ["bank_accounts", tenantId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Add Bank or Credit Card</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <Field label="Account Type">
          <Select value={form.account_type} onValueChange={(v: any) => setForm({ ...form, account_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
              <SelectItem value="payment_clearing">Payment Clearing</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Account Name *">
          <Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="e.g. Baroda KES Account" />
        </Field>
        {form.account_type !== "cash" && (
          <>
            <Field label="Bank Name">
              <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </Field>
            <Field label="Account Number">
              <Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
            </Field>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Opening Balance">
            <Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          className="bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
