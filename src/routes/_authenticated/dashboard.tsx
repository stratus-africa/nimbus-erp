import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Plus } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Nimbus ERP" }] }),
  component: Dashboard,
});

function monthKey(d: Date) {
  return d.toLocaleString("en-US", { month: "short" }) + "\n" + d.getFullYear();
}

function Dashboard() {
  const { data: profile } = useProfile();
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const tenantId = profile?.currentTenant?.id;

  const { data } = useQuery({
    enabled: !!tenantId,
    queryKey: ["dashboard", tenantId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [inv, bills] = await Promise.all([
        supabase
          .from("invoices")
          .select("total, balance_due, status, invoice_date, due_date")
          .eq("tenant_id", tenantId!)
          .is("deleted_at", null),
        supabase
          .from("bills")
          .select("total, balance_due, status, bill_date, due_date, supplier_id, suppliers(name)")
          .eq("tenant_id", tenantId!)
          .is("deleted_at", null),
      ]);
      const invoices = inv.data ?? [];
      const billsArr = bills.data ?? [];

      // Receivables split
      let recCurrent = 0;
      let recOverdue = 0;
      for (const r of invoices as any[]) {
        const bal = Number(r.balance_due ?? 0);
        if (bal <= 0) continue;
        const due = r.due_date ? new Date(r.due_date) : null;
        if (due && due < today) recOverdue += bal;
        else recCurrent += bal;
      }
      // Payables split
      let payCurrent = 0;
      let payOverdue = 0;
      for (const r of billsArr as any[]) {
        const bal = Number(r.balance_due ?? 0);
        if (bal <= 0) continue;
        const due = r.due_date ? new Date(r.due_date) : null;
        if (due && due < today) payOverdue += bal;
        else payCurrent += bal;
      }

      // Cash flow + Income/Expense (last 12 months of fiscal year = this calendar year)
      const fyStart = new Date(today.getFullYear(), 0, 1);
      const months: { name: string; income: number; expense: number; cash: number }[] = [];
      let cumulative = 0;
      for (let i = 0; i < 12; i++) {
        const d = new Date(fyStart.getFullYear(), i, 1);
        const income = (invoices as any[])
          .filter((r) => {
            if (!r.invoice_date) return false;
            const x = new Date(r.invoice_date);
            return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
          })
          .reduce((s, r) => s + Number(r.total ?? 0), 0);
        const expense = (billsArr as any[])
          .filter((r) => {
            if (!r.bill_date) return false;
            const x = new Date(r.bill_date);
            return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
          })
          .reduce((s, r) => s + Number(r.total ?? 0), 0);
        cumulative += income - expense;
        months.push({ name: monthKey(d), income, expense, cash: cumulative });
      }

      const totalIncome = months.reduce((s, m) => s + m.income, 0);
      const totalExpense = months.reduce((s, m) => s + m.expense, 0);
      const incoming = totalIncome;
      const outgoing = totalExpense;
      const cashStart = 0;
      const cashEnd = cashStart + incoming - outgoing;

      // Top expenses by supplier
      const bySupplier = new Map<string, number>();
      for (const r of billsArr as any[]) {
        const name = r.suppliers?.name ?? "—";
        bySupplier.set(name, (bySupplier.get(name) ?? 0) + Number(r.total ?? 0));
      }
      const topExpenses = [...bySupplier.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      return {
        recCurrent,
        recOverdue,
        payCurrent,
        payOverdue,
        months,
        totalIncome,
        totalExpense,
        cashStart,
        incoming,
        outgoing,
        cashEnd,
        topExpenses,
        fyYear: fyStart.getFullYear(),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back
          {profile?.profile?.full_name ? `, ${profile.profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's how {profile?.currentTenant?.name ?? "your workspace"} is doing.
        </p>
      </div>

      {/* Receivables & Payables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ReceivablesCard
          currency={currency}
          current={data?.recCurrent ?? 0}
          overdue={data?.recOverdue ?? 0}
        />
        <PayablesCard
          currency={currency}
          current={data?.payCurrent ?? 0}
          overdue={data?.payOverdue ?? 0}
        />
      </div>

      {/* Cash Flow */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Cash Flow</CardTitle>
            <span className="text-xs text-muted-foreground">This Fiscal Year</span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1fr_240px]">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.months ?? []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)} K`}
                />
                <Tooltip
                  formatter={(v: any) => formatCurrency(v, currency)}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cash"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#cf)"
                  dot={{ r: 3, fill: "hsl(var(--primary))" }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-5 text-sm">
            <CashRow
              dot="bg-muted-foreground/40"
              label={`Cash as on 01/01/${data?.fyYear ?? new Date().getFullYear()}`}
              value={formatCurrency(data?.cashStart ?? 0, currency)}
            />
            <CashRow
              dot="bg-success"
              label="Incoming"
              value={`${formatCurrency(data?.incoming ?? 0, currency)} ( + )`}
            />
            <CashRow
              dot="bg-destructive"
              label="Outgoing"
              value={`${formatCurrency(data?.outgoing ?? 0, currency)} ( - )`}
            />
            <CashRow
              dot="bg-primary"
              label={`Cash as on 31/12/${data?.fyYear ?? new Date().getFullYear()}`}
              value={`${formatCurrency(data?.cashEnd ?? 0, currency)} ( = )`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Income & Expense + Top Expenses */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Income and Expense</CardTitle>
              <span className="text-xs text-muted-foreground">This Fiscal Year</span>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-6 text-sm">
              <Legend dot="bg-success" label="Total Income" value={formatCurrency(data?.totalIncome ?? 0, currency)} />
              <Legend dot="bg-destructive" label="Total Expenses" value={formatCurrency(data?.totalExpense ?? 0, currency)} />
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.months ?? []} barGap={4}>
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
              <span className="text-xs text-muted-foreground">This Fiscal Year</span>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {data?.topExpenses?.length ? (
              <ul className="space-y-3">
                {data.topExpenses.map((e, i) => {
                  const max = data.topExpenses[0].total || 1;
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
              <div className="grid h-40 place-items-center text-sm text-muted-foreground">
                No expense data yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReceivablesCard({ currency, current, overdue }: { currency: string; current: number; overdue: number }) {
  const total = current + overdue;
  const overduePct = total > 0 ? (overdue / total) * 100 : 0;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30">
        <CardTitle className="text-base font-semibold">Total Receivables</CardTitle>
        <Link to="/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <Plus className="h-4 w-4" /> New
        </Link>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <div>
          <div className="text-xs text-muted-foreground">Total Unpaid Invoices</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(total, currency)}</div>
        </div>
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

function PayablesCard({ currency, current, overdue }: { currency: string; current: number; overdue: number }) {
  const total = current + overdue;
  const overduePct = total > 0 ? (overdue / total) * 100 : 0;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30">
        <CardTitle className="text-base font-semibold">Total Payables</CardTitle>
        <Link to="/bills" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <Plus className="h-4 w-4" /> New
        </Link>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <div>
          <div className="text-xs text-muted-foreground">Total Unpaid Bills</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(total, currency)}</div>
        </div>
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
