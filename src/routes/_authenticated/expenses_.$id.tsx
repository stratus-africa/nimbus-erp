import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { ExpenseStatusBadge } from "@/components/expenses/expense-status-badge";
import { CheckCircle2, XCircle, Banknote, Trash2, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/expenses_/$id")({
  head: () => ({ meta: [{ title: "Expense — Nimbus ERP" }] }),
  component: ExpenseDetailPage,
});

function ExpenseDetailPage() {
  const { id } = useParams({ from: "/_authenticated/expenses_/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const [rejectComment, setRejectComment] = useState("");

  const { data: exp, isLoading } = useQuery({
    enabled: !!id,
    queryKey: ["expense", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses" as any)
        .select("*, suppliers(name), customers(name), expense_categories(name), payment_account:payment_account_id(code,name), journal:journal_entry_id(id,entry_number,total_debit,total_credit)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: items = [] } = useQuery({
    enabled: !!id,
    queryKey: ["expense_items", id],
    queryFn: async () =>
      (await supabase
        .from("expense_items" as any)
        .select("*, account:account_id(code,name), category:category_id(name)")
        .eq("expense_id", id)
        .order("position")).data ?? [],
  });

  const { data: receipts = [] } = useQuery({
    enabled: !!id,
    queryKey: ["expense_receipts", id],
    queryFn: async () =>
      (await supabase
        .from("expense_receipts" as any)
        .select("*")
        .eq("expense_id", id)
        .order("uploaded_at")).data ?? [],
  });

  const { data: approvals = [] } = useQuery({
    enabled: !!id,
    queryKey: ["expense_approvals", id],
    queryFn: async () =>
      (await supabase
        .from("expense_approvals" as any)
        .select("*")
        .eq("expense_id", id)
        .order("created_at")).data ?? [],
  });

  const { data: journalLines = [] } = useQuery({
    enabled: !!exp?.journal_entry_id,
    queryKey: ["expense_journal_lines", exp?.journal_entry_id],
    queryFn: async () =>
      (await supabase
        .from("journal_lines" as any)
        .select("*, account:account_id(code,name)")
        .eq("entry_id", exp.journal_entry_id)
        .order("position")).data ?? [],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expense", id] });
    qc.invalidateQueries({ queryKey: ["expense_approvals", id] });
    qc.invalidateQueries({ queryKey: ["expenses_list"] });
  };

  const approve = async () => {
    const { error } = await supabase.rpc("approve_expense" as any, { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Approved & posted to journal");
    invalidate();
  };
  const reject = async () => {
    const { error } = await supabase.rpc("reject_expense" as any, { _id: id, _comment: rejectComment });
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    setRejectComment("");
    invalidate();
  };
  const markPaid = async () => {
    const { error } = await supabase.rpc("mark_expense_paid" as any, { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Marked paid");
    invalidate();
  };
  const removeExpense = async () => {
    const { error } = await supabase.from("expenses" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["expenses_list"] });
    navigate({ to: "/expenses" });
  };

  const openReceipt = async (path: string) => {
    const { data } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (isLoading || !exp) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const canApprove = exp.status === "draft" || exp.status === "submitted";
  const canPay = exp.status === "approved";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Expense ${exp.expense_number}`}
        description={`${formatDate(exp.expense_date)} · ${exp.expense_categories?.name ?? "Uncategorized"}`}
        action={
          <div className="flex items-center gap-2">
            <ExpenseStatusBadge status={exp.status} />
            {canApprove && (
              <>
                <Button onClick={approve}><CheckCircle2 className="mr-2 h-4 w-4" /> Approve</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="outline"><XCircle className="mr-2 h-4 w-4" /> Reject</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Reject expense</AlertDialogTitle>
                      <AlertDialogDescription>Add a comment so the submitter knows why.</AlertDialogDescription></AlertDialogHeader>
                    <Textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} placeholder="Reason…" />
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={reject}>Reject</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {canPay && <Button onClick={markPaid}><Banknote className="mr-2 h-4 w-4" /> Mark paid</Button>}
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline"><Trash2 className="mr-2 h-4 w-4 text-red-600" /> Delete</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Delete expense?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently removes the expense and its lines, receipts and approvals.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={removeExpense}>Delete</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4 md:col-span-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Field label="Vendor" value={exp.suppliers?.name ?? "—"} />
            <Field label="Customer" value={exp.customers?.name ?? "—"} />
            <Field label="Paid through" value={exp.payment_account ? `${exp.payment_account.code} · ${exp.payment_account.name}` : "—"} />
            <Field label="Billable" value={exp.is_billable ? "Yes" : "No"} />
            <Field label="Subtotal" value={formatCurrency(exp.subtotal, currency)} />
            <Field label="Tax" value={formatCurrency(exp.tax_amount, currency)} />
            <Field label="Total" value={formatCurrency(exp.total_amount, currency)} />
            <Field label="Reference" value={exp.reference ?? "—"} />
          </div>
          {exp.notes && <div className="text-sm"><span className="text-muted-foreground">Notes: </span>{exp.notes}</div>}
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Receipts</div>
          {!receipts.length ? <div className="mt-2 text-sm text-muted-foreground">No receipts attached.</div> : (
            <ul className="mt-2 space-y-1 text-sm">
              {receipts.map((r: any) => (
                <li key={r.id}>
                  <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => openReceipt(r.file_path)}>
                    <FileText className="h-3.5 w-3.5" />{r.file_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">Lines</TabsTrigger>
          <TabsTrigger value="journal">Accounting</TabsTrigger>
          <TabsTrigger value="approvals">Approval timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="lines">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Category</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Tax</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((it: any) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.category?.name ?? "—"}</TableCell>
                    <TableCell>{it.account ? `${it.account.code} · ${it.account.name}` : "—"}</TableCell>
                    <TableCell>{it.description ?? "—"}</TableCell>
                    <TableCell className="text-right">{it.quantity}</TableCell>
                    <TableCell className="text-right">{Number(it.rate).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(it.tax_amount, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(it.amount) + Number(it.tax_amount), currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="journal">
          <Card className="p-4">
            {!exp.journal_entry_id ? (
              <div className="text-sm text-muted-foreground">No journal posted yet. Approve the expense to post a balanced entry automatically.</div>
            ) : (
              <>
                <div className="mb-2 text-sm">Journal: <span className="font-mono">{exp.journal?.entry_number}</span></div>
                <Table>
                  <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {journalLines.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.account?.code} · {l.account?.name}</TableCell>
                        <TableCell>{l.description ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(l.debit, currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(l.credit, currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="approvals">
          <Card className="p-4">
            {!approvals.length ? <div className="text-sm text-muted-foreground">No approval actions yet.</div> : (
              <ul className="space-y-2 text-sm">
                {approvals.map((a: any) => (
                  <li key={a.id} className="flex items-start gap-2">
                    <span className={`mt-1 inline-block h-2 w-2 rounded-full ${a.status === "approved" ? "bg-emerald-500" : a.status === "rejected" ? "bg-red-500" : "bg-yellow-500"}`} />
                    <div>
                      <div className="font-medium capitalize">{a.status}</div>
                      <div className="text-xs text-muted-foreground">{a.acted_at ? formatDate(a.acted_at) : formatDate(a.created_at)}</div>
                      {a.comments && <div className="mt-1">{a.comments}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
