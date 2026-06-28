import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useExpenseAccounts } from "@/hooks/use-expenses";
import { SEED_CATEGORIES } from "@/lib/expense-types";

export const Route = createFileRoute("/_authenticated/expenses_/categories")({
  head: () => ({ meta: [{ title: "Expense Categories — Nimbus ERP" }] }),
  component: ExpenseCategoriesPage,
});

function ExpenseCategoriesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const { data: cats = [], isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["expense_categories_full", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories" as any)
        .select("*, parent:parent_category_id(id,name), account:expense_account_id(id,code,name)")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const seed = async () => {
    if (!tenantId) return;
    const existing = new Set(cats.map((c: any) => c.name.toLowerCase()));
    const toInsert = SEED_CATEGORIES.filter((n) => !existing.has(n.toLowerCase()))
      .map((n) => ({ tenant_id: tenantId, name: n }));
    if (!toInsert.length) return toast.info("All defaults already exist.");
    const { error } = await supabase.from("expense_categories" as any).insert(toInsert);
    if (error) return toast.error(error.message);
    toast.success(`Added ${toInsert.length} categories`);
    qc.invalidateQueries({ queryKey: ["expense_categories_full"] });
    qc.invalidateQueries({ queryKey: ["expense_categories"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    const { error } = await supabase.from("expense_categories" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Category deleted");
    qc.invalidateQueries({ queryKey: ["expense_categories_full"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense Categories"
        description="Organize expenses with categories and sub-categories."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/expenses" })}>Back</Button>
            <Button variant="outline" onClick={seed}>Add defaults</Button>
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" /> New category</Button>
          </div>
        }
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Default account</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !cats.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No categories yet. Click "Add defaults" to seed common ones.</TableCell></TableRow>
            ) : cats.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.parent?.name ?? "—"}</TableCell>
                <TableCell>{c.account ? `${c.account.code} · ${c.account.name}` : "—"}</TableCell>
                <TableCell>{c.is_active ? "Yes" : "No"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CategoryDialog open={open} onOpenChange={setOpen} editing={editing} tenantId={tenantId!} categories={cats} onSaved={() => qc.invalidateQueries({ queryKey: ["expense_categories_full"] })} />
    </div>
  );
}

function CategoryDialog({ open, onOpenChange, editing, tenantId, categories, onSaved }: any) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string>("none");
  const [account, setAccount] = useState<string>("none");
  const [active, setActive] = useState(true);
  const { data: accounts = [] } = useExpenseAccounts(tenantId);
  const expenseAccts = accounts.filter((a: any) => a.account_type === "expense");

  useState(() => {});
  // sync when editing changes
  if (open && editing && editing.id !== (window as any).__catEdit) {
    (window as any).__catEdit = editing.id;
    setName(editing.name ?? "");
    setParent(editing.parent_category_id ?? "none");
    setAccount(editing.expense_account_id ?? "none");
    setActive(editing.is_active ?? true);
  } else if (open && !editing && (window as any).__catEdit !== null) {
    (window as any).__catEdit = null;
    setName(""); setParent("none"); setAccount("none"); setActive(true);
  }

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    const payload = {
      tenant_id: tenantId,
      name: name.trim(),
      parent_category_id: parent === "none" ? null : parent,
      expense_account_id: account === "none" ? null : account,
      is_active: active,
    };
    const { error } = editing
      ? await supabase.from("expense_categories" as any).update(payload).eq("id", editing.id)
      : await supabase.from("expense_categories" as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Updated" : "Created");
    (window as any).__catEdit = undefined;
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) (window as any).__catEdit = undefined; onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Parent category</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {categories.filter((c: any) => !editing || c.id !== editing.id).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default expense account</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {expenseAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="cat-active" />
            <Label htmlFor="cat-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
