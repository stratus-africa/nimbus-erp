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
  const [viewingId, setViewingId] = useState<string | null>(null);
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
  const viewing = useMemo(() => (customers ?? []).find((c: any) => c.id === viewingId) ?? null, [customers, viewingId]);

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
                    <button onClick={() => setViewingId(c.id)} className="text-primary hover:underline font-normal text-left">
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

      <CustomerSlideOver
        customer={viewing}
        tenantId={tenantId}
        currency={currency}
        open={!!viewingId}
        onOpenChange={(v) => !v && setViewingId(null)}
        onEdit={(c) => { setViewingId(null); openEdit(c); }}
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

function CustomerSlideOver({
  customer, tenantId, currency, open, onOpenChange, onEdit,
}: {
  customer: any | null;
  tenantId: string | undefined;
  currency: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (c: Customer) => void;
}) {
  const customerId: string | undefined = customer?.id;

  const { data: invoices } = useQuery({
    enabled: !!customerId && !!tenantId && open,
    queryKey: ["customer-invoices", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, due_date, status, total, balance_due")
        .eq("tenant_id", tenantId!)
        .eq("customer_id", customerId!)
        .is("deleted_at", null)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payments } = useQuery({
    enabled: !!customerId && !!tenantId && open,
    queryKey: ["customer-payments", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id, amount, payment_date, method, invoice_id, invoices(invoice_number, customer_id)")
        .eq("tenant_id", tenantId!)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.invoices?.customer_id === customerId);
    },
  });

  const { data: credits } = useQuery({
    enabled: !!customerId && !!tenantId && open,
    queryKey: ["customer-credits", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credits")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openInvoices = (invoices ?? []).filter((i: any) => Number(i.balance_due ?? 0) > 0 && i.status !== "cancelled");
  const totalOpen = openInvoices.reduce((s: number, i: any) => s + Number(i.balance_due ?? 0), 0);
  const totalCredit = (credits ?? []).reduce((s: number, c: any) => s + Number(c.balance ?? 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {!customer ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader className="space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SheetTitle className="text-xl">{customer.name}</SheetTitle>
                  {customer.company_name && (
                    <SheetDescription>{customer.company_name}</SheetDescription>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => onEdit(customer)} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                {customer.email && (
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</span>
                )}
                {customer.phone && (
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
                )}
              </div>
            </SheetHeader>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Outstanding</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(totalOpen, currency)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Unused credits</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(totalCredit, currency)}</div>
              </div>
            </div>

            <Tabs defaultValue="invoices" className="mt-6">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="invoices">Open invoices</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="credits">Credits</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
              </TabsList>

              <TabsContent value="invoices" className="mt-4">
                {openInvoices.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openInvoices.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                          <TableCell>{formatDate(i.invoice_date)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_COLORS[i.status] ?? ""}>{statusLabel(i.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(i.balance_due, currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty label="No open invoices." />
                )}
                <div className="mt-3 text-right">
                  <Link to="/invoices" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    View all invoices <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </TabsContent>

              <TabsContent value="transactions" className="mt-4 space-y-4">
                <div>
                  <h4 className="mb-2 text-sm font-medium">All invoices</h4>
                  {invoices?.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((i: any) => (
                          <TableRow key={i.id}>
                            <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                            <TableCell>{formatDate(i.invoice_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={STATUS_COLORS[i.status] ?? ""}>{statusLabel(i.status)}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(i.total, currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : <Empty label="No invoices yet." />}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium">Payments received</h4>
                  {payments?.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((p: any) => (
                          <TableRow key={p.id}>
                            <TableCell>{formatDate(p.payment_date)}</TableCell>
                            <TableCell className="font-mono text-xs">{p.invoices?.invoice_number ?? "—"}</TableCell>
                            <TableCell className="capitalize">{p.method ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(p.amount, currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : <Empty label="No payments yet." />}
                </div>
              </TabsContent>

              <TabsContent value="credits" className="mt-4">
                {credits?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Issued</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {credits.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell>{formatDate(c.credit_date ?? c.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{c.reference ?? c.credit_number ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_COLORS[c.status] ?? ""}>{statusLabel(c.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(c.amount, currency)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(c.balance, currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <Empty label="No credit history." />}
              </TabsContent>

              <TabsContent value="contacts" className="mt-4 space-y-3">
                <ContactRow label="Primary contact" value={customer.contact_person ?? customer.name} />
                <ContactRow label="Email" value={customer.email} />
                <ContactRow label="Phone" value={customer.phone} />
                <ContactRow label="VAT number" value={customer.vat_number} />
                <ContactRow label="Billing address" value={customer.billing_address} multiline />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-md border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">{label}</div>;
}

function ContactRow({ label, value, multiline }: { label: string; value?: string | null; multiline?: boolean }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm", multiline && "whitespace-pre-wrap")}>{value || "—"}</div>
    </div>
  );
}
