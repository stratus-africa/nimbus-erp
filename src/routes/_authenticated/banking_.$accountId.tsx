import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, ChevronDown, Search, Settings as SettingsIcon, Plus, X,
  Landmark, Wallet, CreditCard, CheckCircle2, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/banking_/$accountId")({
  head: () => ({ meta: [{ title: "Account — Nimbus ERP" }] }),
  component: BankAccountDetailPage,
});

type Txn = {
  id: string;
  txn_date: string;
  reference: string | null;
  description: string | null;
  txn_type: string;
  status: string;
  branch: string | null;
  deposit: number;
  withdrawal: number;
  from_account_id: string | null;
  from_account?: { code: string; name: string } | null;
  source_type?: string | null;
  source_id?: string | null;
};

function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency, currencyDisplay: "code",
      minimumFractionDigits: 2,
    }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toFixed(2)}`;
  }
}

function formatDate(d: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

const TYPE_ICON = {
  cash: Wallet,
  bank: Landmark,
  credit_card: CreditCard,
  payment_clearing: CheckCircle2,
} as const;

function BankAccountDetailPage() {
  const { accountId } = useParams({ from: "/_authenticated/banking_/$accountId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const [tab, setTab] = useState<"dashboard" | "transactions">("transactions");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const { data: account, isLoading } = useQuery({
    enabled: !!tenantId && !!accountId,
    queryKey: ["bank_account", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts" as any)
        .select("*")
        .eq("id", accountId)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: allAccounts } = useQuery({
    enabled: !!tenantId,
    queryKey: ["bank_accounts_sidebar", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts" as any)
        .select("id, account_name, account_number, account_type")
        .eq("tenant_id", tenantId!)
        .order("account_name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: txns = [] } = useQuery({
    enabled: !!tenantId && !!accountId,
    queryKey: ["bank_transactions", accountId],
    queryFn: async (): Promise<Txn[]> => {
      const { data, error } = await supabase
        .from("bank_transactions" as any)
        .select("*, from_account:from_account_id(code, name)")
        .eq("bank_account_id", accountId)
        .order("txn_date", { ascending: false });
      if (error) throw error;
      return (data as any[]) as Txn[];
    },
  });

  // Running balance (oldest first) → re-attach
  const txnsWithBalance = useMemo(() => {
    const ob = Number(account?.opening_balance ?? 0);
    const sorted = [...txns].sort((a, b) =>
      a.txn_date === b.txn_date ? a.id.localeCompare(b.id) : a.txn_date < b.txn_date ? -1 : 1,
    );
    let running = ob;
    const map = new Map<string, number>();
    for (const t of sorted) {
      running += Number(t.deposit || 0) - Number(t.withdrawal || 0);
      map.set(t.id, running);
    }
    return txns.map((t) => ({ ...t, running: map.get(t.id) ?? 0 }));
  }, [txns, account]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return txnsWithBalance;
    return txnsWithBalance.filter((t) =>
      [t.reference, t.description, t.branch].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [txnsWithBalance, search]);

  const currency = account?.currency ?? "KES";
  const bookBalance = useMemo(() => {
    const ob = Number(account?.opening_balance ?? 0);
    return ob + txns.reduce((s, t) => s + Number(t.deposit || 0) - Number(t.withdrawal || 0), 0);
  }, [account, txns]);

  const deleteTxn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_transactions" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction deleted");
      qc.invalidateQueries({ queryKey: ["bank_transactions", accountId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !tenantId) {
    return <div className="p-10 text-center text-muted-foreground">Loading account…</div>;
  }
  if (!account) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Account not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/banking" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Banking
        </Button>
      </div>
    );
  }

  const Icon = (TYPE_ICON as any)[account.account_type] ?? Landmark;

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)] bg-background">
      {/* Top search bar */}
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate({ to: "/banking" })}>
          <RotateCcw className="h-4 w-4" />
        </Button>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search in Banking ( / )"
            className="h-9 pl-9 bg-muted/40 border-0"
          />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-semibold inline-flex items-center gap-2 min-w-0">
            <span className="truncate">{account.account_name}</span>
            <AccountPicker accounts={allAccounts ?? []} currentId={accountId} onChange={(id) =>
              navigate({ to: "/banking/$accountId", params: { accountId: id } })
            } />
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="h-9 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" /> Add Transaction
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-500 hover:text-rose-600"
            onClick={() => navigate({ to: "/banking" })}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Balance summary */}
      <div className="border-b bg-card px-6 py-3 flex items-center gap-4">
        <div className={cn(
          "grid h-10 w-10 place-items-center rounded-md",
          account.account_type === "cash" && "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40",
          account.account_type === "bank" && "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40",
          account.account_type === "credit_card" && "bg-violet-50 text-violet-600 dark:bg-violet-950/40",
          account.account_type === "payment_clearing" && "bg-sky-50 text-sky-600 dark:bg-sky-950/40",
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Amount in Books</div>
          <div className="text-lg font-semibold tabular-nums">{formatMoney(bookBalance, currency)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b bg-muted/30 px-6 flex items-end gap-2">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
          <div className="text-sm">Dashboard</div>
          <div className="text-[10px] text-muted-foreground">Account Summary</div>
        </TabButton>
        <TabButton active={tab === "transactions"} onClick={() => setTab("transactions")}>
          <div className="text-sm">Transactions</div>
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-card">
        {tab === "transactions" ? (
          <>
            <div className="grid grid-cols-[40px_140px_1.4fr_1.4fr_1fr_1.4fr_1fr_1fr_1fr] items-center gap-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
              <div />
              <div className="inline-flex items-center gap-1">Date <ChevronDown className="h-3 w-3" /></div>
              <div>Reference#</div>
              <div>Type</div>
              <div>Status</div>
              <div>Branch</div>
              <div className="text-right">Deposits</div>
              <div className="text-right">Withdrawals</div>
              <div className="text-right">Running Balance</div>
            </div>
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No transactions yet. Click <span className="font-medium">Add Transaction</span> to add one.
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((t) => (
                  <div key={t.id}
                    className="grid grid-cols-[40px_140px_1.4fr_1.4fr_1fr_1.4fr_1fr_1fr_1fr] items-start gap-3 px-5 py-3 hover:bg-muted/30 group">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox />
                    </div>
                    <div className="text-sm">{formatDate(t.txn_date)}</div>
                    <div className="text-sm">{t.reference ?? "—"}</div>
                    <div className="text-sm">
                      <div>{t.description ?? "—"}</div>
                      {t.from_account && (
                        <div className="text-xs text-muted-foreground">
                          From Account: {t.from_account.name}
                          <div>Account Code: {t.from_account.code}</div>
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {(t.status ?? "manually_added").replace(/_/g, " ")}
                    </div>
                    <div className="text-sm">{t.branch ?? "—"}</div>
                    <div className="text-right text-sm tabular-nums">
                      {Number(t.deposit) > 0 ? formatMoney(Number(t.deposit), currency) : ""}
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      {Number(t.withdrawal) > 0 ? formatMoney(Number(t.withdrawal), currency) : ""}
                    </div>
                    <div className="text-right text-sm tabular-nums flex items-center justify-end gap-2">
                      <span>{formatMoney((t as any).running ?? 0, currency)}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-xs text-destructive hover:underline"
                        onClick={() => {
                          if (confirm("Delete this transaction?")) deleteTxn.mutate(t.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t flex items-center justify-between px-5 py-3 text-xs text-muted-foreground">
              <div>Total Count: <Link to="/banking" className="text-primary hover:underline">{filtered.length}</Link></div>
              <div>1 - {filtered.length}</div>
            </div>
          </>
        ) : (
          <DashboardTab
            account={account}
            txns={txns}
            currency={currency}
            bookBalance={bookBalance}
          />
        )}
      </div>

      <AddTxnDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        tenantId={tenantId!}
        accountId={accountId}
        currency={currency}
      />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-left rounded-t-md -mb-px border border-transparent transition-colors",
        active
          ? "bg-card border-border border-b-card text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AccountPicker({
  accounts, currentId, onChange,
}: { accounts: any[]; currentId: string; onChange: (id: string) => void }) {
  return (
    <Select value={currentId} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto border-0 bg-transparent text-primary px-1 gap-1">
        <ChevronDown className="h-4 w-4" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DashboardTab({ account, txns, currency, bookBalance }: any) {
  const ob = Number(account?.opening_balance ?? 0);
  const totalIn = txns.reduce((s: number, t: any) => s + Number(t.deposit || 0), 0);
  const totalOut = txns.reduce((s: number, t: any) => s + Number(t.withdrawal || 0), 0);
  return (
    <div className="p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Opening Balance" value={formatMoney(ob, currency)} />
      <Stat label="Total Deposits" value={formatMoney(totalIn, currency)} />
      <Stat label="Total Withdrawals" value={formatMoney(totalOut, currency)} />
      <Stat label="Current Balance" value={formatMoney(bookBalance, currency)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AddTxnDialog({
  open, onClose, tenantId, accountId, currency,
}: { open: boolean; onClose: () => void; tenantId: string; accountId: string; currency: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    txn_date: new Date().toISOString().slice(0, 10),
    reference: "",
    description: "",
    direction: "deposit" as "deposit" | "withdrawal",
    amount: "0",
    branch: "",
    from_account_id: "" as string,
  });

  const { data: coa } = useQuery({
    enabled: open,
    queryKey: ["coa-options", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type")
        .eq("tenant_id", tenantId)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(form.amount) || 0;
      if (amt <= 0) throw new Error("Amount must be greater than 0");
      const payload = {
        tenant_id: tenantId,
        bank_account_id: accountId,
        txn_date: form.txn_date,
        reference: form.reference.trim() || null,
        description: form.description.trim() || null,
        branch: form.branch.trim() || null,
        from_account_id: form.from_account_id || null,
        deposit: form.direction === "deposit" ? amt : 0,
        withdrawal: form.direction === "withdrawal" ? amt : 0,
        status: "manually_added",
        txn_type: "manual",
      };
      const { error } = await supabase.from("bank_transactions" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction added");
      qc.invalidateQueries({ queryKey: ["bank_transactions", accountId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} />
            </Field>
            <Field label="Direction">
              <Select value={form.direction} onValueChange={(v: any) => setForm({ ...form, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Reference #">
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e.g. May 2026 Airtime" />
          </Field>
          <Field label="Description / Type">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={`Amount (${currency})`}>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Offset Account (Chart of Accounts)">
            <Select value={form.from_account_id} onValueChange={(v) => setForm({ ...form, from_account_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select ledger" /></SelectTrigger>
              <SelectContent>
                {(coa ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Branch">
            <Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
