import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, MoreHorizontal, SlidersHorizontal, Search } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/suppliers/")({
  head: () => ({ meta: [{ title: "Suppliers — Nimbus ERP" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    highlight: typeof s.highlight === "string" ? s.highlight : undefined,
  }),
  component: SuppliersPage,
});

type Supplier = {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  pin_number?: string | null;
  contact_person?: string | null;
};

type FilterKey = "active" | "all" | "duplicate";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "active", label: "Active Suppliers" },
  { key: "all", label: "All Suppliers" },
  { key: "duplicate", label: "Duplicate Suppliers" },
];

function SuppliersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const qc = useQueryClient();
  const { highlight } = Route.useSearch();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [filter, setFilter] = useState<FilterKey>("active");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (!highlight) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => {
      navigate({ to: "/suppliers", search: {}, replace: true });
    }, 4000);
    return () => clearTimeout(t);
  }, [highlight, navigate]);

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["suppliers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payables } = useQuery({
    enabled: !!tenantId,
    queryKey: ["suppliers-payables", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("supplier_id, balance_due, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const b of data ?? []) {
        if (!b.supplier_id) continue;
        if (b.status === "cancelled" || b.status === "draft") continue;
        map.set(b.supplier_id, (map.get(b.supplier_id) ?? 0) + Number(b.balance_due ?? 0));
      }
      return map;
    },
  });

  const upsert = useMutation({
    mutationFn: async (s: Supplier) => {
      const payload: any = { ...s, tenant_id: tenantId! };
      const { error } = s.id
        ? await supabase.from("suppliers").update(payload).eq("id", s.id)
        : await supabase.from("suppliers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("Saved"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((c: any) => {
      if (!q) return true;
      return [c.name, c.contact_person, c.email, c.phone].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [rows, query]);

  const allChecked = filtered.length > 0 && filtered.every((c: any) => selected.has(c.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((c: any) => c.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const openNew = () => navigate({ to: "/suppliers/new" });
  const openEdit = (s: Supplier) => { setEditing(s); setDialogOpen(true); };

  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "Active Suppliers";

  return (
    <div className="-m-6">
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search in Suppliers ( / )`}
            className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 text-xl font-semibold hover:text-primary">
              {filterLabel}
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {FILTERS.map((f) => (
              <DropdownMenuItem key={f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          <Button onClick={openNew} className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4" /> New
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-t bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-12 pl-6">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                </div>
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact Person</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Work Phone</TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Payables (BCY)</TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Unused Credits (BCY)</TableHead>
              <TableHead className="w-10 pr-6">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !filtered.length ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No suppliers found.</TableCell></TableRow>
            ) : filtered.map((c: any) => {
              const payable = payables?.get(c.id) ?? 0;
              return (
                <TableRow
                  key={c.id}
                  ref={highlight === c.id ? highlightRef : undefined}
                  className={cn(
                    "group transition-colors",
                    selected.has(c.id) && "bg-primary/5",
                    highlight === c.id && "bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-inset ring-emerald-500/60 animate-in fade-in",
                  )}
                >
                  <TableCell className="pl-6">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                  </TableCell>
                  <TableCell>
                    <button onClick={() => openEdit(c)} className="text-primary hover:underline font-normal text-left">
                      {c.name}
                    </button>
                  </TableCell>
                  <TableCell>{c.contact_person ?? ""}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? ""}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(payable, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(0, currency)}</TableCell>
                  <TableCell className="pr-6"></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={(s) => upsert.mutate(s)}
        saving={upsert.isPending}
      />
    </div>
  );
}

function SupplierDialog({ open, onOpenChange, initial, onSubmit, saving }: { open: boolean; onOpenChange: (v: boolean) => void; initial: Supplier | null; onSubmit: (s: Supplier) => void; saving: boolean; }) {
  const [c, setC] = useState<Supplier>({ name: "" });
  useEffect(() => { setC(initial ?? { name: "" }); }, [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{c.id ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label>Name *</Label><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Contact person</Label><Input value={c.contact_person ?? ""} onChange={(e) => setC({ ...c, contact_person: e.target.value })} /></div>
          <div className="space-y-2"><Label>PIN #</Label><Input value={c.pin_number ?? ""} onChange={(e) => setC({ ...c, pin_number: e.target.value })} /></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={c.email ?? ""} onChange={(e) => setC({ ...c, email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={c.phone ?? ""} onChange={(e) => setC({ ...c, phone: e.target.value })} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Address</Label><Textarea value={c.address ?? ""} onChange={(e) => setC({ ...c, address: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!c.name || saving} onClick={() => onSubmit(c)}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
