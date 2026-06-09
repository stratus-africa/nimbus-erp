import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, MoreHorizontal, SlidersHorizontal, Search, Mail, Phone, Pencil, ArrowUpRight } from "lucide-react";
import { formatCurrency, formatDate, statusLabel, STATUS_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — Nimbus ERP" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    highlight: typeof s.highlight === "string" ? s.highlight : undefined,
  }),
  component: CustomersPage,
});

type Customer = {
  id?: string;
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_address?: string | null;
  vat_number?: string | null;
  contact_person?: string | null;
};

type FilterKey = "active" | "all" | "duplicate" | "crm";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "active", label: "Active Customers" },
  { key: "all", label: "All Customers" },
  { key: "duplicate", label: "Duplicate Customers" },
  { key: "crm", label: "Customers from CRM" },
];

function CustomersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const qc = useQueryClient();
  const { highlight } = Route.useSearch();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [filter, setFilter] = useState<FilterKey>("active");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  // Scroll & clear highlight after a moment
  useEffect(() => {
    if (!highlight) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => {
      navigate({ to: "/customers", search: {}, replace: true });
    }, 4000);
    return () => clearTimeout(t);
  }, [highlight, navigate]);

  const { data: customers, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["customers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers").select("*").eq("tenant_id", tenantId!).is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: receivables } = useQuery({
    enabled: !!tenantId,
    queryKey: ["customers-receivables", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices").select("customer_id, balance_due, status")
        .eq("tenant_id", tenantId!).is("deleted_at", null);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const inv of data ?? []) {
        if (!inv.customer_id) continue;
        if (inv.status === "cancelled" || inv.status === "draft") continue;
        map.set(inv.customer_id, (map.get(inv.customer_id) ?? 0) + Number(inv.balance_due ?? 0));
      }
      return map;
    },
  });

  const upsert = useMutation({
    mutationFn: async (c: Customer) => {
      const payload: any = { ...c, tenant_id: tenantId! };
      const { error } = c.id
        ? await supabase.from("customers").update(payload).eq("id", c.id)
        : await supabase.from("customers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("Saved"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (customers ?? []).filter((c: any) => {
      if (!q) return true;
      return [c.name, c.company_name, c.email, c.phone].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [customers, query]);

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

  const openNew = () => navigate({ to: "/customers/new" });
  const openEdit = (c: Customer) => { setEditing(c); setDialogOpen(true); };

  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "Active Customers";

  return (
    <div className="-m-6">
      {/* Top search bar */}
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search in Customers ( / )`}
            className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
          />
        </div>
      </div>

      {/* Page header */}
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

      {/* Table */}
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
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Company Name</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Work Phone</TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Receivables (BCY)</TableHead>
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
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No customers found.</TableCell></TableRow>
            ) : filtered.map((c: any) => {
              const receivable = receivables?.get(c.id) ?? 0;
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
                  <TableCell>{c.company_name ?? c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? ""}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(receivable, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(0, currency)}</TableCell>
                  <TableCell className="pr-6"></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={(c) => upsert.mutate(c)}
        saving={upsert.isPending}
      />
    </div>
  );
}

function CustomerDialog({ open, onOpenChange, initial, onSubmit, saving }: { open: boolean; onOpenChange: (v: boolean) => void; initial: Customer | null; onSubmit: (c: Customer) => void; saving: boolean; }) {
  const [c, setC] = useState<Customer>({ name: "" });
  useEffect(() => { setC(initial ?? { name: "" }); }, [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{c.id ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label>Name *</Label><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Company name</Label><Input value={c.company_name ?? ""} onChange={(e) => setC({ ...c, company_name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Contact person</Label><Input value={c.contact_person ?? ""} onChange={(e) => setC({ ...c, contact_person: e.target.value })} /></div>
          <div className="space-y-2"><Label>VAT number</Label><Input value={c.vat_number ?? ""} onChange={(e) => setC({ ...c, vat_number: e.target.value })} /></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={c.email ?? ""} onChange={(e) => setC({ ...c, email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={c.phone ?? ""} onChange={(e) => setC({ ...c, phone: e.target.value })} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Billing address</Label><Textarea value={c.billing_address ?? ""} onChange={(e) => setC({ ...c, billing_address: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!c.name || saving} onClick={() => onSubmit(c)}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
