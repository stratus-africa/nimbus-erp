import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, statusLabel, STATUS_COLORS } from "@/lib/format";
import { ArrowUpRight, Calendar as CalendarIcon, FileText, Receipt, Plus } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RangePreset = "today" | "month" | "year" | "custom";
type DashSearch = { range?: RangePreset; from?: string; to?: string };

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Nimbus ERP" }] }),
  validateSearch: (s: Record<string, unknown>): DashSearch => {
    const r = typeof s.range === "string" ? (s.range as RangePreset) : undefined;
    return {
      range: r && ["today", "month", "year", "custom"].includes(r) ? r : undefined,
      from: typeof s.from === "string" ? s.from : undefined,
      to: typeof s.to === "string" ? s.to : undefined,
    };
  },
  component: Dashboard,
});

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function resolveRange(search: DashSearch): { preset: RangePreset; from: string; to: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const preset = search.range ?? "month";
  if (preset === "today") return { preset, from: iso(today), to: iso(today) };
  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { preset, from: iso(start), to: iso(end) };
  }
  if (preset === "year") {
    return { preset, from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(new Date(today.getFullYear(), 11, 31)) };
  }
  // custom
  const from = search.from ?? iso(new Date(today.getFullYear(), today.getMonth(), 1));
  const to = search.to ?? iso(today);
  return { preset: "custom", from, to };
}

function inRange(d: string | null | undefined, from: string, to: string) {
  if (!d) return false;
  return d >= from && d <= to;
}

function monthsBetween(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(to);
  const out: { year: number; month: number; label: string }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last && out.length < 24) {
    out.push({
      year: cur.getFullYear(),
      month: cur.getMonth(),
      label: cur.toLocaleString("en-US", { month: "short" }) + " " + cur.getFullYear(),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function Dashboard() {
  const { data: profile } = useProfile();
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const tenantId = profile?.currentTenant?.id;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { preset, from, to } = useMemo(() => resolveRange(search), [search]);

  const setPreset = (p: RangePreset, extra?: { from?: string; to?: string }) => {
    navigate({ to: "/dashboard", search: { range: p, ...extra } });
  };

  const { data } = useQuery({
    enabled: !!tenantId,
    queryKey: ["dashboard", tenantId, from, to],
    queryFn: async () => {
      const [inv, bills] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, total, balance_due, status, invoice_date, due_date, created_at, customer_id, customers(name)")
          .eq("tenant_id", tenantId!)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("bills")
          .select("id, bill_number, total, balance_due, status, bill_date, due_date, created_at, supplier_id, suppliers(name)")
          .eq("tenant_id", tenantId!)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      ]);
      return { invoices: inv.data ?? [], bills: bills.data ?? [] };
    },
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const computed = useMemo(() => {
    const invoices = (data?.invoices ?? []).filter((r: any) => inRange(r.invoice_date, from, to));
    const bills = (data?.bills ?? []).filter((r: any) => inRange(r.bill_date, from, to));

    let recCurrent = 0;
    let recOverdue = 0;
    for (const r of invoices as any[]) {
      const bal = Number(r.balance_due ?? 0);
      if (bal <= 0) continue;
      const due = r.due_date ? new Date(r.due_date) : null;
      if (due && due < today) recOverdue += bal;
      else recCurrent += bal;
    }
    let payCurrent = 0;
    let payOverdue = 0;
    for (const r of bills as any[]) {
      const bal = Number(r.balance_due ?? 0);
      if (bal <= 0) continue;
      const due = r.due_date ? new Date(r.due_date) : null;
      if (due && due < today) payOverdue += bal;
      else payCurrent += bal;
    }

    const months = monthsBetween(from, to);
    let cumulative = 0;
    const series = months.map((m) => {
      const income = (invoices as any[])
        .filter((r) => r.invoice_date && new Date(r.invoice_date).getFullYear() === m.year && new Date(r.invoice_date).getMonth() === m.month)
        .reduce((s, r) => s + Number(r.total ?? 0), 0);
      const expense = (bills as any[])
        .filter((r) => r.bill_date && new Date(r.bill_date).getFullYear() === m.year && new Date(r.bill_date).getMonth() === m.month)
        .reduce((s, r) => s + Number(r.total ?? 0), 0);
      cumulative += income - expense;
      return { name: m.label, income, expense, cash: cumulative };
    });

    const totalIncome = series.reduce((s, m) => s + m.income, 0);
    const totalExpense = series.reduce((s, m) => s + m.expense, 0);

    const bySupplier = new Map<string, number>();
    for (const r of bills as any[]) {
      const name = r.suppliers?.name ?? "—";
      bySupplier.set(name, (bySupplier.get(name) ?? 0) + Number(r.total ?? 0));
    }
    const topExpenses = [...bySupplier.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Recent activity timeline (sorted desc by created_at, picked from filtered range)
    const events = [
      ...invoices.map((r: any) => ({
        kind: "invoice" as const,
        id: r.id,
        number: r.invoice_number,
        party: r.customers?.name ?? "—",
        date: r.invoice_date,
        created: r.created_at,
        status: r.status,
        total: Number(r.total ?? 0),
      })),
      ...bills.map((r: any) => ({
        kind: "bill" as const,
        id: r.id,
        number: r.bill_number,
        party: r.suppliers?.name ?? "—",
        date: r.bill_date,
        created: r.created_at,
        status: r.status,
        total: Number(r.total ?? 0),
      })),
    ].sort((a, b) => String(b.created).localeCompare(String(a.created)));

    return {
      recCurrent, recOverdue, payCurrent, payOverdue,
      series, totalIncome, totalExpense,
      cashStart: 0, incoming: totalIncome, outgoing: totalExpense, cashEnd: totalIncome - totalExpense,
      topExpenses,
      recentInvoices: invoices.slice(0, 6),
      recentBills: bills.slice(0, 6),
      timeline: events.slice(0, 10),
    };
  }, [data, from, to, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome back
            {profile?.profile?.full_name ? `, ${profile.profile.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's how {profile?.currentTenant?.name ?? "your workspace"} is doing.
          </p>
        </div>
        <DateRangeFilter preset={preset} from={from} to={to} onChange={setPreset} />
      </div>

      {/* Receivables & Payables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ReceivablesCard
          currency={currency}
          current={computed.recCurrent}
          overdue={computed.recOverdue}
          from={from}
          to={to}
        />
        <PayablesCard
          currency={currency}
          current={computed.payCurrent}
          overdue={computed.payOverdue}
          from={from}
          to={to}
        />
      </div>

      {/* Cash Flow */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Cash Flow</CardTitle>
            <span className="text-xs text-muted-foreground">{formatDate(from)} — {formatDate(to)}</span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1fr_240px]">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={computed.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)} K`} />
                <Tooltip
                  formatter={(v: any) => formatCurrency(v, currency)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="cash" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cf)" dot={{ r: 3, fill: "hsl(var(--primary))" }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-5 text-sm">
            <CashRow dot="bg-muted-foreground/40" label={`Cash on ${formatDate(from)}`} value={formatCurrency(computed.cashStart, currency)} />
            <CashRow dot="bg-success" label="Incoming" value={`${formatCurrency(computed.incoming, currency)} ( + )`} />
            <CashRow dot="bg-destructive" label="Outgoing" value={`${formatCurrency(computed.outgoing, currency)} ( - )`} />
            <CashRow dot="bg-primary" label={`Cash on ${formatDate(to)}`} value={`${formatCurrency(computed.cashEnd, currency)} ( = )`} />
          </div>
        </CardContent>
      </Card>

      {/* Income & Expense + Top Expenses */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Income and Expense</CardTitle>
              <span className="text-xs text-muted-foreground">{formatDate(from)} — {formatDate(to)}</span>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-6 text-sm">
              <Legend dot="bg-success" label="Total Income" value={formatCurrency(computed.totalIncome, currency)} />
              <Legend dot="bg-destructive" label="Total Expenses" value={formatCurrency(computed.totalExpense, currency)} />
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={computed.series} barGap={4}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)} K`} />
                  <Tooltip
                    formatter={(v: any) => formatCurrency(v, currency)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="income" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Top Expenses</CardTitle>
              <span className="text-xs text-muted-foreground">{formatDate(from)} — {formatDate(to)}</span>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {computed.topExpenses.length ? (
              <ul className="space-y-3">
                {computed.topExpenses.map((e, i) => {
                  const max = computed.topExpenses[0].total || 1;
                  const pct = Math.max(4, Math.round((e.total / max) * 100));
                  return (
                    <li key={e.name + i} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{e.name}</span>
                        <span className="font-medium tabular-nums">{formatCurrency(e.total, currency)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="grid h-40 place-items-center text-sm text-muted-foreground">No expense data in this range.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            <span className="text-xs text-muted-foreground">Latest events in this range</span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[300px_1fr]">
          {/* Timeline */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Timeline</h3>
            {computed.timeline.length ? (
              <ol className="relative space-y-4 border-l pl-5">
                {computed.timeline.map((e: any) => (
                  <li key={`${e.kind}-${e.id}`} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[26px] mt-1 grid h-5 w-5 place-items-center rounded-full border bg-background",
                        e.kind === "invoice" ? "text-emerald-600" : "text-amber-600",
                      )}
                    >
                      {e.kind === "invoice" ? <FileText className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                    </span>
                    <div className="text-xs text-muted-foreground">{formatDate(e.created ?? e.date)}</div>
                    <div className="text-sm">
                      <span className="font-medium">
                        {e.kind === "invoice" ? "Invoice" : "Bill"} {e.number}
                      </span>{" "}
                      <span className="text-muted-foreground">to {e.party}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs">
                      <Badge variant="outline" className={STATUS_COLORS[e.status] ?? ""}>{statusLabel(e.status)}</Badge>
                      <span className="tabular-nums text-muted-foreground">{formatCurrency(e.total, currency)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-sm text-muted-foreground">No activity in this range.</div>
            )}
          </div>

          {/* Tables */}
          <div className="grid gap-6 md:grid-cols-2">
            <ActivityTable
              title="Latest Customer Invoices"
              link={{ to: "/invoices", search: { from, to } as any }}
              rows={computed.recentInvoices.map((r: any) => ({
                id: r.id, number: r.invoice_number, party: r.customers?.name ?? "—",
                date: r.invoice_date, status: r.status, total: Number(r.total ?? 0),
              }))}
              currency={currency}
            />
            <ActivityTable
              title="Latest Supplier Bills"
              link={{ to: "/bills", search: { from, to } as any }}
              rows={computed.recentBills.map((r: any) => ({
                id: r.id, number: r.bill_number, party: r.suppliers?.name ?? "—",
                date: r.bill_date, status: r.status, total: Number(r.total ?? 0),
              }))}
              currency={currency}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DateRangeFilter({
  preset, from, to, onChange,
}: {
  preset: RangePreset;
  from: string;
  to: string;
  onChange: (p: RangePreset, extra?: { from?: string; to?: string }) => void;
}) {
  const opts: { key: RangePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "month", label: "This Month" },
    { key: "year", label: "This Year" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border bg-card">
        {opts.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              "px-3 py-1.5 text-sm transition-colors",
              preset === o.key ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                preset === "custom" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Custom
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input type="date" defaultValue={from} onChange={(e) => onChange("custom", { from: e.target.value, to })} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input type="date" defaultValue={to} onChange={(e) => onChange("custom", { from, to: e.target.value })} />
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatDate(from)} — {formatDate(to)}
      </span>
    </div>
  );
}

function ActivityTable({
  title, rows, currency, link,
}: {
  title: string;
  rows: { id: string; number: string; party: string; date: string; status: string; total: number }[];
  currency: string;
  link: { to: string; search?: any };
}) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <Link to={link.to as any} search={link.search} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      {rows.length ? (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.party}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{r.number}</span>
                  <span>·</span>
                  <span>{formatDate(r.date)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="tabular-nums">{formatCurrency(r.total, currency)}</span>
                <Badge variant="outline" className={cn("text-[10px]", STATUS_COLORS[r.status] ?? "")}>{statusLabel(r.status)}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing yet.</div>
      )}
    </div>
  );
}

function ReceivablesCard({ currency, current, overdue, from, to }: { currency: string; current: number; overdue: number; from: string; to: string }) {
  const total = current + overdue;
  const overduePct = total > 0 ? (overdue / total) * 100 : 0;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30">
        <CardTitle className="text-base font-semibold">Total Receivables</CardTitle>
        <div className="flex items-center gap-3">
          <Link to="/invoices" search={{ from, to, onlyOpen: true } as any} className="text-sm text-primary hover:underline">
            View
          </Link>
          <Link to="/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Plus className="h-4 w-4" /> New
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <Link to="/invoices" search={{ from, to, onlyOpen: true } as any} className="block group">
          <div className="text-xs text-muted-foreground">Total Unpaid Invoices</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums group-hover:text-primary transition-colors">{formatCurrency(total, currency)}</div>
        </Link>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            <div className="bg-primary" style={{ width: `${100 - overduePct}%` }} />
            <div className="bg-warning" style={{ width: `${overduePct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Legend dot="bg-primary" label="Current" value={formatCurrency(current, currency)} />
          <Legend dot="bg-warning" label="Overdue" value={formatCurrency(overdue, currency)} />
        </div>
      </CardContent>
    </Card>
  );
}

function PayablesCard({ currency, current, overdue, from, to }: { currency: string; current: number; overdue: number; from: string; to: string }) {
  const total = current + overdue;
  const overduePct = total > 0 ? (overdue / total) * 100 : 0;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30">
        <CardTitle className="text-base font-semibold">Total Payables</CardTitle>
        <div className="flex items-center gap-3">
          <Link to="/bills" search={{ from, to, onlyOpen: true } as any} className="text-sm text-primary hover:underline">
            View
          </Link>
          <Link to="/bills" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Plus className="h-4 w-4" /> New
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <Link to="/bills" search={{ from, to, onlyOpen: true } as any} className="block group">
          <div className="text-xs text-muted-foreground">Total Unpaid Bills</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums group-hover:text-primary transition-colors">{formatCurrency(total, currency)}</div>
        </Link>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            <div className="bg-primary" style={{ width: `${100 - overduePct}%` }} />
            <div className="bg-warning" style={{ width: `${overduePct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Legend dot="bg-primary" label="Current" value={formatCurrency(current, currency)} />
          <Legend dot="bg-warning" label="Overdue" value={formatCurrency(overdue, currency)} />
        </div>
      </CardContent>
    </Card>
  );
}

function CashRow({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`inline-block h-2 w-2 rounded-sm ${dot}`} />
        {label}
      </div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-sm ${dot}`} />
      <span className="text-muted-foreground">{label}</span>
      {value && (
        <>
          <span className="text-muted-foreground">:</span>
          <span className="font-medium tabular-nums">{value}</span>
        </>
      )}
    </div>
  );
}

