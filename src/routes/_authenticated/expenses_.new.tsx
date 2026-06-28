import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import { useExpenseAccounts, useExpenseCategories, usePaymentAccounts } from "@/hooks/use-expenses";
import type { ExpenseItemInput } from "@/lib/expense-types";

export const Route = createFileRoute("/_authenticated/expenses_/new")({
  head: () => ({ meta: [{ title: "New Expense — Nimbus ERP" }] }),
  component: NewExpensePage,
});

function emptyLine(pos: number): ExpenseItemInput {
  return { category_id: null, account_id: null, description: "", quantity: 1, rate: 0, amount: 0, tax_rate: 0, tax_amount: 0, customer_id: null, position: pos };
}

function NewExpensePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vendorId, setVendorId] = useState<string>("none");
  const [customerId, setCustomerId] = useState<string>("none");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");
  const [billable, setBillable] = useState(false);
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<ExpenseItemInput[]>([emptyLine(0)]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: vendors = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["vendors_picker", tenantId],
    queryFn: async () => (await supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId!).order("name")).data ?? [],
  });
  const { data: customers = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["customers_picker_exp", tenantId],
    queryFn: async () => (await supabase.from("customers").select("id, name").eq("tenant_id", tenantId!).order("name")).data ?? [],
  });
  const { data: categories = [] } = useExpenseCategories(tenantId);
  const { data: accounts = [] } = useExpenseAccounts(tenantId);
  const { data: payAccts = [] } = usePaymentAccounts(tenantId);
  const expenseAccts = accounts.filter((a: any) => a.account_type === "expense");

  useEffect(() => {
    if (!paymentAccountId && payAccts.length) setPaymentAccountId(payAccts[0].id);
  }, [payAccts, paymentAccountId]);

  const updateLine = (i: number, patch: Partial<ExpenseItemInput>) => {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const next = { ...l, ...patch };
      next.amount = Number(next.quantity || 0) * Number(next.rate || 0);
      next.tax_amount = +(next.amount * (Number(next.tax_rate || 0) / 100)).toFixed(2);
      return next;
    }));
  };
  const addLine = () => setLines((p) => [...p, emptyLine(p.length)]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, position: idx })));

  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
    const tax = lines.reduce((s, l) => s + Number(l.tax_amount || 0), 0);
    return { sub, tax, total: sub + tax };
  }, [lines]);

  const save = async (mode: "draft" | "submit") => {
    if (!tenantId) return;
    if (!lines.length || lines.every((l) => !l.amount)) return toast.error("Add at least one line with an amount.");
    if (mode === "submit" && !paymentAccountId) return toast.error("Pick a payment account before submitting.");
    if (billable && customerId === "none") return toast.error("Billable expenses require a customer.");
    for (const l of lines) {
      if (!l.amount) continue;
      const acct = l.account_id ?? (categories.find((c: any) => c.id === l.category_id)?.expense_account_id ?? null);
      if (!acct) return toast.error("Each line needs an expense account (or a category with one).");
    }

    setSaving(true);
    try {
      const { data: numResp, error: numErr } = await supabase.rpc("next_doc_number" as any, { _tenant: tenantId, _doc_type: "expense" });
      if (numErr) throw numErr;
      const expense_number = numResp as unknown as string;

      const { data: created, error: insErr } = await supabase
        .from("expenses" as any)
        .insert({
          tenant_id: tenantId,
          expense_number,
          expense_date: date,
          submitted_by_user_id: profile?.user?.id,
          employee_user_id: profile?.user?.id,
          vendor_id: vendorId === "none" ? null : vendorId,
          customer_id: customerId === "none" ? null : customerId,
          category_id: categoryId === "none" ? null : categoryId,
          payment_account_id: paymentAccountId || null,
          currency,
          subtotal: totals.sub,
          tax_amount: totals.tax,
          total_amount: totals.total,
          status: mode === "submit" ? "submitted" : "draft",
          is_billable: billable,
          notes,
          reference,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const expenseId = (created as any).id as string;

      const linePayload = lines.filter((l) => Number(l.amount) > 0).map((l, i) => ({
        expense_id: expenseId,
        category_id: l.category_id,
        account_id: l.account_id,
        description: l.description,
        quantity: l.quantity,
        rate: l.rate,
        amount: l.amount,
        tax_rate: l.tax_rate,
        tax_amount: l.tax_amount,
        customer_id: billable ? (customerId === "none" ? null : customerId) : l.customer_id,
        position: i,
      }));
      if (linePayload.length) {
        const { error: lineErr } = await supabase.from("expense_items" as any).insert(linePayload);
        if (lineErr) throw lineErr;
      }

      // Uploads
      for (const f of files) {
        const path = `${tenantId}/${expenseId}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("expense-receipts").upload(path, f);
        if (upErr) {
          toast.error(`Receipt ${f.name}: ${upErr.message}`);
          continue;
        }
        await supabase.from("expense_receipts" as any).insert({
          expense_id: expenseId,
          file_path: path,
          file_name: f.name,
          mime_type: f.type,
          size_bytes: f.size,
          uploaded_by: profile?.user?.id,
        });
      }

      toast.success(`Expense ${expense_number} ${mode === "submit" ? "submitted" : "saved"}`);
      qc.invalidateQueries({ queryKey: ["expenses_list"] });
      navigate({ to: "/expenses/$id", params: { id: expenseId } });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="New Expense"
        description="Record a business, vendor-paid, or employee-reimbursable expense."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/expenses" })}>Cancel</Button>
            <Button variant="outline" onClick={() => save("draft")} disabled={saving}>Save draft</Button>
            <Button onClick={() => save("submit")} disabled={saving}>Submit for approval</Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paid through</Label>
            <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
              <SelectTrigger><SelectValue placeholder="Cash / bank / payable" /></SelectTrigger>
              <SelectContent>
                {payAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Use an employee-payable account for reimbursements.</p>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={billable} onCheckedChange={setBillable} id="billable" />
            <Label htmlFor="billable">Billable to customer</Label>
          </div>
          <div>
            <Label>Customer{billable ? " *" : ""}</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice #, receipt #…" />
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={currency} disabled />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Itemized lines</h3>
          <Button size="sm" variant="outline" onClick={addLine}><Plus className="mr-1 h-4 w-4" /> Add line</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Tax %</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="min-w-[10rem]">
                  <Select value={l.category_id ?? "none"} onValueChange={(v) => updateLine(i, { category_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="min-w-[12rem]">
                  <Select value={l.account_id ?? "none"} onValueChange={(v) => updateLine(i, { account_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Expense account" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Use category default —</SelectItem>
                      {expenseAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></TableCell>
                <TableCell><Input type="number" className="text-right" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} /></TableCell>
                <TableCell><Input type="number" className="text-right" value={l.rate} onChange={(e) => updateLine(i, { rate: Number(e.target.value) })} /></TableCell>
                <TableCell><Input type="number" className="text-right" value={l.tax_rate} onChange={(e) => updateLine(i, { tax_rate: Number(e.target.value) })} /></TableCell>
                <TableCell className="text-right">{(l.amount + l.tax_amount).toFixed(2)}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-3 flex justify-end gap-8 text-sm">
          <div>Subtotal: <span className="font-medium">{totals.sub.toFixed(2)}</span></div>
          <div>Tax: <span className="font-medium">{totals.tax.toFixed(2)}</span></div>
          <div>Total: <span className="font-semibold">{totals.total.toFixed(2)} {currency}</span></div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Notes</Label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" />
          </div>
          <div>
            <Label>Receipts</Label>
            <div className="flex items-center gap-2">
              <Input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              <Upload className="h-4 w-4 text-muted-foreground" />
            </div>
            {files.length > 0 && (
              <ul className="mt-2 text-xs text-muted-foreground">
                {files.map((f) => <li key={f.name}>· {f.name} ({Math.round(f.size / 1024)} KB)</li>)}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
