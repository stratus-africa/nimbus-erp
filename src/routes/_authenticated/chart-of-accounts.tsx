import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, NewButton, useDialogState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chart-of-accounts")({
  head: () => ({ meta: [{ title: "Chart of Accounts — Nimbus ERP" }] }),
  component: CoAPage,
});

type Account = { id?: string; code: string; name: string; account_type: "asset" | "liability" | "equity" | "income" | "expense"; account_subtype?: string | null; description?: string | null; opening_balance?: number };

const SUBTYPES: { type: Account["account_type"]; label: string; subtypes: string[] }[] = [
  { type: "asset", label: "Asset", subtypes: ["Other Asset", "Other Current Asset", "Cash", "Bank", "Fixed Asset", "Accounts Receivable", "Stock", "Payment Clearing Account", "Input Tax", "Intangible Asset", "Non Current Asset", "Deferred Tax Asset"] },
  { type: "liability", label: "Liability", subtypes: ["Other Current Liability", "Credit Card", "Non Current Liability", "Other Liability", "Accounts Payable", "Output Tax", "Deferred Tax Liability"] },
  { type: "equity", label: "Equity", subtypes: ["Equity"] },
  { type: "income", label: "Income", subtypes: ["Income", "Other Income"] },
  { type: "expense", label: "Expense", subtypes: ["Expense", "Cost of Goods Sold", "Other Expense"] },
];

function findTypeForSubtype(sub: string): Account["account_type"] {
  for (const g of SUBTYPES) if (g.subtypes.includes(sub)) return g.type;
  return "asset";
}

const TYPE_COLORS: Record<string, string> = {
  asset: "bg-info/10 text-info",
  liability: "bg-warning/10 text-warning-foreground",
  equity: "bg-primary/10 text-primary",
  income: "bg-success/10 text-success",
  expense: "bg-destructive/10 text-destructive",
};

function CoAPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const dlg = useDialogState<Account>();

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["coa", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("chart_of_accounts").select("*").eq("tenant_id", tenantId!).order("code");
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (a: Account) => {
      const payload: any = { ...a, tenant_id: tenantId! };
      const { error } = a.id ? await supabase.from("chart_of_accounts").update(payload).eq("id", a.id) : await supabase.from("chart_of_accounts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coa"] }); toast.success("Saved"); dlg.setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coa"] }); toast.success("Account deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Chart of Accounts" description="Your accounting structure." action={<NewButton onClick={() => dlg.openFor({ code: "", name: "", account_type: "asset" })} label="New account" />} />
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead className="w-24">Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Opening</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              : rows?.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono">{a.code}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="outline" className={TYPE_COLORS[a.account_type] ?? ""}>{a.account_type}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{Number(a.opening_balance ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => dlg.openFor(a)}>Edit</Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => dlg.openFor(a)}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete account "${a.name}"? This may fail if the account is in use.`)) remove.mutate(a.id);
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      <AccountDialog open={dlg.open} onOpenChange={dlg.setOpen} initial={dlg.data} onSubmit={(a: Account) => upsert.mutate(a)} saving={upsert.isPending} />
    </div>
  );
}

function AccountDialog({ open, onOpenChange, initial, onSubmit, saving }: { open: boolean; onOpenChange: (v: boolean) => void; initial: Account | null; onSubmit: (a: Account) => void; saving: boolean }) {
  const [a, setA] = useState<Account>({ code: "", name: "", account_type: "asset" });
  useEffect(() => { setA(initial ?? { code: "", name: "", account_type: "asset" }); }, [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{a.id ? "Edit account" : "New account"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Code *</Label><Input value={a.code} onChange={(e) => setA({ ...a, code: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={a.account_type} onValueChange={(v: any) => setA({ ...a, account_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["asset", "liability", "equity", "income", "expense"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label>Name *</Label><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Opening balance</Label><Input type="number" step="0.01" value={a.opening_balance ?? 0} onChange={(e) => setA({ ...a, opening_balance: parseFloat(e.target.value) || 0 })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!a.code || !a.name || saving} onClick={() => onSubmit(a)}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
