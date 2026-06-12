import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMemo, useState } from "react";
import {
  ChevronDown, Plus, Search, X, Paperclip, MoreHorizontal, Settings2,
  ChevronRight, MessageSquare,
} from "lucide-react";
import { formatCurrency, formatDate, statusLabel, STATUS_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/suppliers/$supplierId")({
  head: () => ({ meta: [{ title: "Supplier — Nimbus ERP" }] }),
  component: SupplierDetailsPage,
});

type FilterKey = "active" | "all" | "duplicate";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "active", label: "Active Suppliers" },
  { key: "all", label: "All Suppliers" },
  { key: "duplicate", label: "Duplicate Suppliers" },
];

function SupplierDetailsPage() {
  const { supplierId } = Route.useParams();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";

  const [filter, setFilter] = useState<FilterKey>("active");
  const [query, setQuery] = useState("");

  const { data: suppliers } = useQuery({
    enabled: !!tenantId,
    queryKey: ["suppliers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers").select("*").eq("tenant_id", tenantId!).is("deleted_at", null)
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
        .from("bills").select("supplier_id, balance_due, status")
        .eq("tenant_id", tenantId!).is("deleted_at", null);
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

  const supplier = useMemo(
    () => (suppliers ?? []).find((s: any) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  const { data: bills } = useQuery({
    enabled: !!supplierId && !!tenantId,
    queryKey: ["supplier-bills", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_number, bill_date, due_date, status, total, balance_due, created_at")
        .eq("tenant_id", tenantId!)
        .eq("supplier_id", supplierId!)
        .is("deleted_at", null)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payments } = useQuery({
    enabled: !!supplierId && !!tenantId,
    queryKey: ["supplier-payments", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bill_payments")
        .select("id, amount, payment_date, method, bill_id, bills(bill_number, supplier_id)")
        .eq("tenant_id", tenantId!)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.bills?.supplier_id === supplierId);
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (suppliers ?? []).filter((s: any) => {
      if (!q) return true;
      return [s.name, s.email, s.phone, s.contact_person].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [suppliers, query]);

  const openBills = (bills ?? []).filter((b: any) => Number(b.balance_due ?? 0) > 0 && b.status !== "cancelled");
  const totalOpen = openBills.reduce((s: number, b: any) => s + Number(b.balance_due ?? 0), 0);
  const totalExpense = (bills ?? [])
    .filter((b: any) => b.status !== "cancelled" && b.status !== "draft")
    .reduce((s: number, b: any) => s + Number(b.total ?? 0), 0);

  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "Active Suppliers";
  const paymentTermsDays = supplier?.payment_terms_days ?? 0;
  const paymentTermsLabel = paymentTermsDays === 0 ? "Due on Receipt" : `Net ${paymentTermsDays}`;

  const timeline = useMemo(() => {
    const events: { ts: string; title: string; detail?: string }[] = [];
    for (const b of bills ?? []) {
      events.push({
        ts: b.created_at ?? b.bill_date,
        title: "Bill created",
        detail: `Bill ${b.bill_number} • ${formatCurrency(b.total, currency)}`,
      });
    }
    for (const p of payments ?? []) {
      events.push({
        ts: p.payment_date,
        title: "Payment made",
        detail: `${p.bills?.bill_number ?? "—"} • ${formatCurrency(p.amount, currency)}`,
      });
    }
    return events.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? "")).slice(0, 8);
  }, [bills, payments, currency]);

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in Suppliers ( / )"
            className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-[320px] shrink-0 border-r bg-card flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary">
                  {filterLabel}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {FILTERS.map((f) => (
                  <DropdownMenuItem key={f.key} onClick={() => setFilter(f.key)}>{f.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-1.5">
              <Button
                size="icon"
                onClick={() => navigate({ to: "/suppliers/new" })}
                className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.map((s: any) => {
              const isActive = s.id === supplierId;
              const payable = payables?.get(s.id) ?? 0;
              return (
                <Link
                  key={s.id}
                  to="/suppliers/$supplierId"
                  params={{ supplierId: s.id }}
                  className={cn(
                    "flex items-start gap-3 border-b px-4 py-3 text-sm hover:bg-muted/40 transition-colors",
                    isActive && "bg-primary/5 border-l-2 border-l-primary",
                  )}
                >
                  <Checkbox className="mt-0.5" checked={isActive} onCheckedChange={() => {}} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(payable, currency)}
                    </div>
                  </div>
                </Link>
              );
            })}
            {!filtered.length && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">No suppliers.</div>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto bg-background">
          {!supplier ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              {suppliers ? "Supplier not found." : "Loading…"}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b bg-card px-6 py-3.5">
                <h1 className="truncate text-xl font-semibold">{supplier.name}</h1>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8" onClick={() => navigate({ to: "/suppliers/$supplierId/edit", params: { supplierId } })}>Edit</Button>
                  <Button variant="outline" size="icon" className="h-8 w-8"><Paperclip className="h-4 w-4" /></Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                        New Transaction <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Purchases</div>
                      <DropdownMenuItem onClick={() => navigate({ to: "/bills/new" })}>Bill</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate({ to: "/payments-made/new" })}>Bill Payment</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate({ to: "/purchase-orders/new" })}>Purchase Order</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" className="h-8 gap-1">
                    More <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Link to="/suppliers" className="ml-1 text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </Link>
                </div>
              </div>

              <Tabs defaultValue="overview" className="px-6 pt-3">
                <TabsList className="h-10 w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                  {[
                    { v: "overview", l: "Overview" },
                    { v: "comments", l: "Comments" },
                    { v: "transactions", l: "Transactions" },
                    { v: "mails", l: "Mails & Messages" },
                    { v: "statement", l: "Statement" },
                  ].map((t) => (
                    <TabsTrigger
                      key={t.v}
                      value={t.v}
                      className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 text-sm text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                      {t.l}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="overview" className="mt-0 pt-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-5">
                      <div>
                        <div className="text-sm font-medium">{supplier.name}</div>
                      </div>

                      {supplier.contact_person && (
                        <div className="rounded-md bg-muted/40 p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-sm font-medium">{supplier.contact_person}</div>
                              {supplier.email && (
                                <div className="text-sm text-primary">{supplier.email}</div>
                              )}
                              <div className="mt-2 flex gap-3 text-xs">
                                <button className="text-primary hover:underline">Send Email</button>
                              </div>
                            </div>
                            <Settings2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      )}

                      <Section title="ADDRESS">
                        <Field label="Address" value={supplier.address ?? "No Address"} actionLabel="New Address" />
                      </Section>

                      <Section title="OTHER DETAILS">
                        <KV label="Supplier Code" value={supplier.code ?? "—"} />
                        <KV label="Default Currency" value={currency} />
                        <KV label="VAT Treatment" value={supplier.vat_number ? "VAT Registered" : "Not Registered"} link />
                        <KV label="VAT Registration Number" value={supplier.vat_number ?? "—"} link />
                        <KV label="Supplier Language" value="English" />
                      </Section>

                      <Section title={`CONTACT PERSONS (${supplier.contact_person ? 1 : 0})`}>
                        {supplier.contact_person ? (
                          <div className="flex items-center gap-3 rounded-md py-2">
                            <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-medium">
                              {(supplier.contact_person ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="text-sm">
                              <div className="font-medium">{supplier.contact_person}</div>
                              <div className="text-muted-foreground">{supplier.email ?? "—"}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">No contact persons.</div>
                        )}
                      </Section>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <div className="text-sm text-muted-foreground">Payment due period</div>
                        <div className="text-sm">{paymentTermsLabel}</div>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-medium">Payables</div>
                        <div className="overflow-hidden rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Currency</th>
                                <th className="px-3 py-2 text-right font-medium">Outstanding Payables</th>
                                <th className="px-3 py-2 text-right font-medium">Unused Credits</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-t">
                                <td className="px-3 py-3">{currency}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-primary">{formatCurrency(totalOpen, currency)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(0, currency)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <button className="mt-2 text-xs text-primary hover:underline">Enter Opening Balance</button>
                      </div>

                      <div>
                        <div className="flex items-end justify-between">
                          <div className="text-sm font-medium">Expenses</div>
                        </div>
                        <p className="mb-3 text-xs text-muted-foreground">
                          This chart is displayed in the organization's base currency.
                        </p>
                        <div className="rounded-md border p-4">
                          <div className="text-xs text-muted-foreground">Total Expenses</div>
                          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(totalExpense, currency)}</div>
                        </div>
                      </div>

                      {timeline.length > 0 && (
                        <div>
                          <div className="mb-2 text-sm font-medium">Recent Activity</div>
                          <ol className="relative space-y-3 border-l pl-4">
                            {timeline.map((e, i) => (
                              <li key={i} className="relative">
                                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                                <div className="text-xs text-muted-foreground">{formatDate(e.ts)}</div>
                                <div className="text-sm">{e.title}</div>
                                {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="comments" className="pt-6">
                  <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                    <MessageSquare className="mt-0.5 h-4 w-4" />
                    No comments yet.
                  </div>
                </TabsContent>

                <TabsContent value="transactions" className="pt-6 space-y-6">
                  <div>
                    <div className="mb-2 text-sm font-medium">Bills</div>
                    {bills?.length ? (
                      <div className="overflow-hidden rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>#</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Due</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bills.map((b: any) => (
                              <TableRow key={b.id}>
                                <TableCell className="font-mono text-xs">{b.bill_number}</TableCell>
                                <TableCell>{formatDate(b.bill_date)}</TableCell>
                                <TableCell>{formatDate(b.due_date)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={STATUS_COLORS[b.status] ?? ""}>{statusLabel(b.status)}</Badge>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(b.total, currency)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(b.balance_due, currency)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : <Empty label="No bills yet." />}
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium">Payments Made</div>
                    {payments?.length ? (
                      <div className="overflow-hidden rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Bill</TableHead>
                              <TableHead>Method</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments.map((p: any) => (
                              <TableRow key={p.id}>
                                <TableCell>{formatDate(p.payment_date)}</TableCell>
                                <TableCell className="font-mono text-xs">{p.bills?.bill_number ?? "—"}</TableCell>
                                <TableCell className="capitalize">{p.method ?? "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(p.amount, currency)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : <Empty label="No payments yet." />}
                  </div>
                </TabsContent>

                <TabsContent value="mails" className="pt-6">
                  <Empty label="No mails or messages." />
                </TabsContent>

                <TabsContent value="statement" className="pt-6">
                  <div className="rounded-md border p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold">Statement of Account</div>
                        <div className="text-xs text-muted-foreground">{supplier.name}</div>
                      </div>
                      <Button variant="outline" size="sm">Download PDF</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <KV label="Outstanding payables" value={formatCurrency(totalOpen, currency)} />
                      <KV label="Total expenses" value={formatCurrency(totalExpense, currency)} />
                      <KV label="Open bills" value={`${openBills.length}`} />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="h-10" />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-4">
      <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <ChevronRight className="h-3.5 w-3.5 rotate-90" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value, actionLabel }: { label: string; value: string; actionLabel?: string }) {
  return (
    <div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-sm text-muted-foreground">
        {value}
        {actionLabel && <> - <button className="text-primary hover:underline">{actionLabel}</button></>}
      </div>
    </div>
  );
}

function KV({ label, value, link }: { label: string; value: React.ReactNode; link?: boolean }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 text-sm">
      <div className={cn("text-muted-foreground", link && "text-primary")}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-md border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">{label}</div>;
}
