import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { PageHeader, NewButton } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { ExpenseStatusBadge } from "@/components/expenses/expense-status-badge";
import { useExpenseCategories } from "@/hooks/use-expenses";
import { Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Nimbus ERP" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const { data: categories = [] } = useExpenseCategories(tenantId);

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["expenses_list", tenantId, status, categoryId],
    queryFn: async () => {
      let qy = supabase
        .from("expenses" as any)
        .select("id, expense_number, expense_date, total_amount, status, is_billable, notes, category_id, customer_id, vendor_id, customers(name), suppliers(name), expense_categories(name)")
        .eq("tenant_id", tenantId!)
        .order("expense_date", { ascending: false });
      if (status !== "all") qy = qy.eq("status", status);
      if (categoryId !== "all") qy = qy.eq("category_id", categoryId);
      const { data, error } = await qy;
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return rows;
    return rows.filter(
      (r: any) =>
        r.expense_number?.toLowerCase().includes(s) ||
        r.notes?.toLowerCase().includes(s) ||
        r.expense_categories?.name?.toLowerCase().includes(s) ||
        r.customers?.name?.toLowerCase().includes(s) ||
        r.suppliers?.name?.toLowerCase().includes(s),
    );
  }, [rows, q]);

  const summary = useMemo(() => {
    const total = rows.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const pending = rows.filter((r: any) => r.status === "submitted").length;
    const approved = rows.filter((r: any) => r.status === "approved").length;
    const billable = rows.filter((r: any) => r.is_billable).length;
    return { total, pending, approved, billable };
  }, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        description="Record, approve, and reimburse all business expenses."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/expenses/categories"><Tag className="mr-2 h-4 w-4" /> Categories</Link>
            </Button>
            <NewButton onClick={() => navigate({ to: "/expenses/new" })} label="New expense" />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Total" value={formatCurrency(summary.total, currency)} />
        <SummaryCard label="Pending Approval" value={String(summary.pending)} />
        <SummaryCard label="Approved" value={String(summary.approved)} />
        <SummaryCard label="Billable" value={String(summary.billable)} />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search expense # / notes / vendor…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["draft","submitted","approved","rejected","paid","cancelled"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expense #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Vendor / Customer</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Billable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : !filtered.length ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No expenses yet.</TableCell></TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate({ to: "/expenses/$id", params: { id: r.id } })}>
                <TableCell className="font-mono text-xs">{r.expense_number}</TableCell>
                <TableCell>{formatDate(r.expense_date)}</TableCell>
                <TableCell>{r.expense_categories?.name ?? "—"}</TableCell>
                <TableCell>{r.suppliers?.name ?? r.customers?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.total_amount, currency)}</TableCell>
                <TableCell><ExpenseStatusBadge status={r.status} /></TableCell>
                <TableCell>{r.is_billable ? "Yes" : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}
