import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Warehouse as WarehouseIcon, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/warehouses")({
  head: () => ({ meta: [{ title: "Warehouses — Nimbus ERP" }] }),
  component: WarehousesPage,
});

type Row = { id: string; name: string; code: string | null; city: string | null; status: string; is_primary: boolean; manager_id: string | null };

function WarehousesPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dlg, setDlg] = useState<{ open: boolean; row?: Row | null }>({ open: false });

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["warehouses", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations" as any)
        .select("id, name, code, city, status, is_primary, manager_id")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const filtered = useMemo(
    () => rows.filter((r: Row) =>
      !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.code?.toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  );

  return (
    <div className="-m-6">
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2">
          <WarehouseIcon className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Warehouses</h1>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search warehouses…" className="h-9 w-64" />
          <Button onClick={() => setDlg({ open: true, row: null })} className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4" /> New Warehouse
          </Button>
        </div>
      </div>

      <div className="bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Primary</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !filtered.length ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No warehouses yet.</TableCell></TableRow>
            ) : filtered.map((r: Row) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate({ to: "/transfer-orders", search: { wh: r.id } as any })}>
                <TableCell className="pl-6 font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.code ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.city ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "default" : "secondary"} className="capitalize">{r.status}</Badge>
                </TableCell>
                <TableCell>{r.is_primary ? <Badge variant="outline">Primary</Badge> : ""}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDlg({ open: true, row: r }); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <WarehouseDialog
        open={dlg.open}
        row={dlg.row ?? null}
        tenantId={tenantId}
        onClose={() => setDlg({ open: false })}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["warehouses"] }); setDlg({ open: false }); }}
      />
    </div>
  );
}

function WarehouseDialog({ open, row, tenantId, onClose, onSaved }:
  { open: boolean; row: Row | null; tenantId?: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", code: "", city: "", status: "active", is_primary: false });

  // re-init on open
  useMemoOpen(open, row, setForm);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      if (!form.name.trim()) throw new Error("Name required");
      const payload: any = {
        tenant_id: tenantId,
        name: form.name.trim(),
        code: form.code.trim() || null,
        city: form.city.trim() || null,
        status: form.status,
        is_primary: form.is_primary,
        is_active: form.status === "active",
      };
      if (row?.id) {
        const { error } = await supabase.from("locations" as any).update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("locations" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(row ? "Warehouse updated" : "Warehouse created"); onSaved(); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{row ? "Edit Warehouse" : "New Warehouse"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          </div>
          <div>
            <Label>Status</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} /> Primary warehouse
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useMemoOpen(open: boolean, row: Row | null, setForm: (f: any) => void) {
  // sync form state when dialog opens
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useMemo(() => {
    if (open) setForm(row
      ? { name: row.name, code: row.code ?? "", city: row.city ?? "", status: row.status, is_primary: row.is_primary }
      : { name: "", code: "", city: "", status: "active", is_primary: false });
  }, [open, row?.id]);
}
