import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Activity, ReceiptText, ShoppingCart, Users, Boxes } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Nimbus ERP" }] }),
  component: Dashboard,
});

function KpiCard({ icon: Icon, label, value, hint }: any) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data: profile } = useProfile();
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const tenantId = profile?.currentTenant?.id;

  const { data: kpis } = useQuery({
    enabled: !!tenantId,
    queryKey: ["dashboard", tenantId],
    queryFn: async () => {
      const [inv, bills, cust, items] = await Promise.all([
        supabase.from("invoices").select("total, balance_due, status, invoice_date").eq("tenant_id", tenantId!).is("deleted_at", null),
        supabase.from("bills").select("total, balance_due, status").eq("tenant_id", tenantId!).is("deleted_at", null),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).is("deleted_at", null),
        supabase.from("items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).is("deleted_at", null),
      ]);
      const invoices = inv.data ?? [];
      const billsArr = bills.data ?? [];
      const totalRevenue = invoices.reduce((s, r: any) => s + Number(r.total ?? 0), 0);
      const outstanding = invoices.reduce((s, r: any) => s + Number(r.balance_due ?? 0), 0);
      const payables = billsArr.reduce((s, r: any) => s + Number(r.balance_due ?? 0), 0);
      // monthly buckets (last 6)
      const months: { name: string; revenue: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleString("en-US", { month: "short" });
        const sum = invoices
          .filter((r: any) => {
            if (!r.invoice_date) return false;
            const x = new Date(r.invoice_date);
            return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
          })
          .reduce((s, r: any) => s + Number(r.total ?? 0), 0);
        months.push({ name: key, revenue: sum });
      }
      return {
        totalRevenue,
        outstanding,
        payables,
        customers: cust.count ?? 0,
        items: items.count ?? 0,
        months,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back{profile?.profile?.full_name ? `, ${profile.profile.full_name.split(" ")[0]}` : ""}</h1>
        <p className="text-sm text-muted-foreground">Here's how {profile?.currentTenant?.name ?? "your workspace"} is doing.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Activity} label="Total revenue" value={formatCurrency(kpis?.totalRevenue ?? 0, currency)} hint="All invoiced" />
        <KpiCard icon={ReceiptText} label="Outstanding" value={formatCurrency(kpis?.outstanding ?? 0, currency)} hint="Unpaid invoices" />
        <KpiCard icon={ShoppingCart} label="Payables" value={formatCurrency(kpis?.payables ?? 0, currency)} hint="Unpaid bills" />
        <KpiCard icon={Users} label="Customers" value={kpis?.customers ?? 0} hint={`${kpis?.items ?? 0} items`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue — last 6 months</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kpis?.months ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip formatter={(v: any) => formatCurrency(v, currency)} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
