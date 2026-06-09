import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PageHeader, NewButton, useDialogState } from "@/components/page-header";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — Nimbus ERP" }] }),
  component: CustomersPage,
});

type Customer = {
  id?: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  billing_address?: string | null;
  tax_number?: string | null;
};

function CustomersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const dlg = useDialogState<Customer>();

  const { data: customers, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["customers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (c: Customer) => {
      const payload = { ...c, tenant_id: tenantId! };
      const { error } = c.id
        ? await supabase.from("customers").update(payload).eq("id", c.id)
        : await supabase.from("customers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Saved");
      dlg.setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Manage your customer accounts."
        action={<NewButton onClick={() => dlg.openFor({ display_name: "" })} label="New customer" />}
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tax #</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !customers?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No customers yet. Click "New customer" to add one.</TableCell></TableRow>
            ) : customers.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.display_name}</TableCell>
                <TableCell>{c.email ?? "—"}</TableCell>
                <TableCell>{c.phone ?? "—"}</TableCell>
                <TableCell>{c.tax_number ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => dlg.openFor(c)}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CustomerDialog open={dlg.open} onOpenChange={dlg.setOpen} initial={dlg.data} onSubmit={(c) => upsert.mutate(c)} saving={upsert.isPending} />
    </div>
  );
}

function CustomerDialog({ open, onOpenChange, initial, onSubmit, saving }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: Customer | null; onSubmit: (c: Customer) => void; saving: boolean;
}) {
  const [c, setC] = useState<Customer>({ display_name: "" });
  useEffect(() => { setC(initial ?? { display_name: "" }); }, [initial, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{c.id ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Display name *</Label>
            <Input value={c.display_name} onChange={(e) => setC({ ...c, display_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={c.email ?? ""} onChange={(e) => setC({ ...c, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={c.phone ?? ""} onChange={(e) => setC({ ...c, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Tax #</Label>
            <Input value={c.tax_number ?? ""} onChange={(e) => setC({ ...c, tax_number: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Billing address</Label>
            <Textarea value={c.billing_address ?? ""} onChange={(e) => setC({ ...c, billing_address: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!c.display_name || saving} onClick={() => onSubmit(c)}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
