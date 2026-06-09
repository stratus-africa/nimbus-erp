import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Nimbus ERP" }] }),
  component: ReportsPage,
});

function exportCSV(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";

  const { data: coa } = useQuery({
    enabled: !!tenantId,
    queryKey: ["report-coa", tenantId],
    queryFn: async () => {
      const { data: accounts } = await supabase.from("chart_of_accounts").select("*").eq("tenant_id", tenantId!);
      const { data: lines } = await supabase.from("journal_lines").select("account_id, debit, credit, journal_entries!inner(tenant_id)").eq("journal_entries.tenant_id", tenantId!);
      const balances = new Map<string, { debit: number; credit: number }>();
      (lines ?? []).forEach((l: any) => {
        const b = balances.get(l.account_id) ?? { debit: 0, credit: 0 };
        b.debit += Number(l.debit ?? 0); b.credit += Number(l.credit ?? 0);
        balances.set(l.account_id, b);
      });
      return (accounts ?? []).map((a: any) => {
        const b = balances.get(a.id) ?? { debit: 0, credit: 0 };
        const isDebitNormal = a.account_type === "asset" || a.account_type === "expense";
        const balance = Number(a.opening_balance ?? 0) + (isDebitNormal ? b.debit - b.credit : b.credit - b.debit);
        return { ...a, debit: b.debit, credit: b.credit, balance };
      });
    },
  });

  const sumBy = (type: string) => coa?.filter((a: any) => a.account_type === type).reduce((s: number, a: any) => s + a.balance, 0) ?? 0;
  const income = sumBy("income"), expense = sumBy("expense");
  const netProfit = income - expense;

  return (
    <div>
      <PageHeader title="Reports" description="Financial snapshots from your books." />
      <Tabs defaultValue="pl">
        <TabsList>
          <TabsTrigger value="pl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="tb">Trial Balance</TabsTrigger>
          <TabsTrigger value="ar">A/R Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="pl">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Profit & Loss</CardTitle><CardDescription>Year to date</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => exportCSV("pnl.csv", coa?.filter((a: any) => ["income", "expense"].includes(a.account_type)).map((a: any) => ({ code: a.code, name: a.name, type: a.account_type, balance: a.balance })) ?? [])}><Download className="mr-2 h-4 w-4" /> Export</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell colSpan={3} className="font-semibold">Income</TableCell></TableRow>
                  {coa?.filter((a: any) => a.account_type === "income").map((a: any) => (
                    <TableRow key={a.id}><TableCell className="font-mono">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell className="text-right">{formatCurrency(a.balance, currency)}</TableCell></TableRow>
                  ))}
                  <TableRow><TableCell colSpan={2} className="text-right font-medium">Total income</TableCell><TableCell className="text-right font-medium">{formatCurrency(income, currency)}</TableCell></TableRow>
                  <TableRow><TableCell colSpan={3} className="font-semibold">Expenses</TableCell></TableRow>
                  {coa?.filter((a: any) => a.account_type === "expense").map((a: any) => (
                    <TableRow key={a.id}><TableCell className="font-mono">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell className="text-right">{formatCurrency(a.balance, currency)}</TableCell></TableRow>
                  ))}
                  <TableRow><TableCell colSpan={2} className="text-right font-medium">Total expense</TableCell><TableCell className="text-right font-medium">{formatCurrency(expense, currency)}</TableCell></TableRow>
                  <TableRow className="bg-muted/50"><TableCell colSpan={2} className="text-right text-base font-semibold">Net profit</TableCell><TableCell className="text-right text-base font-semibold">{formatCurrency(netProfit, currency)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tb">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Trial Balance</CardTitle><CardDescription>All accounts</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => exportCSV("trial-balance.csv", coa?.map((a: any) => ({ code: a.code, name: a.name, type: a.account_type, debit: a.debit, credit: a.credit, balance: a.balance })) ?? [])}><Download className="mr-2 h-4 w-4" /> Export</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                <TableBody>
                  {coa?.map((a: any) => (
                    <TableRow key={a.id}><TableCell className="font-mono">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell className="capitalize">{a.account_type}</TableCell><TableCell className="text-right">{formatCurrency(a.debit, currency)}</TableCell><TableCell className="text-right">{formatCurrency(a.credit, currency)}</TableCell><TableCell className="text-right">{formatCurrency(a.balance, currency)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ar">
          <ARAging tenantId={tenantId!} currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ARAging({ tenantId, currency }: { tenantId: string; currency: string }) {
  const { data } = useQuery({
    enabled: !!tenantId,
    queryKey: ["ar-aging", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("balance_due, due_date, customers(name)").eq("tenant_id", tenantId).gt("balance_due", 0).is("deleted_at", null);
      return data ?? [];
    },
  });
  const buckets = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const today = new Date();
  (data ?? []).forEach((r: any) => {
    const due = r.due_date ? new Date(r.due_date) : today;
    const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const bucket = days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    (buckets as any)[bucket] += Number(r.balance_due);
  });
  return (
    <Card>
      <CardHeader><CardTitle>A/R Aging</CardTitle><CardDescription>Outstanding receivables by age</CardDescription></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {Object.entries(buckets).map(([k, v]) => (
            <div key={k} className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground">{k} days</div>
              <div className="mt-1 text-xl font-semibold">{formatCurrency(v, currency)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
