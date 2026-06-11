import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import {
  ArrowLeft, Pencil, X, ImageIcon, Package, RotateCcw, MoreHorizontal,
  ChevronRight, AlertTriangle, FileText, ShoppingCart, ArrowLeftRight, Activity, Plus, Pencil as PencilIcon,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/items_/$itemId")({
  head: () => ({ meta: [{ title: "Item — Nimbus ERP" }] }),
  component: ItemViewPage,
});

const editSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  sku: z.string().trim().max(64).optional().or(z.literal("")),
  unit: z.string().trim().min(1, "Unit is required").max(32),
  reorder_level: z.coerce.number().min(0, "Must be ≥ 0").max(9999999),
});
type EditValues = z.infer<typeof editSchema>;

function ItemViewPage() {
  const { itemId } = useParams({ from: "/_authenticated/items_/$itemId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const [editOpen, setEditOpen] = useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Transactions: invoice lines, PO lines, adjustment lines for this item, tenant-scoped via RLS.
  const { data: txData } = useQuery({
    enabled: !!item && !!tenantId,
    queryKey: ["item-transactions", itemId, tenantId],
    queryFn: async () => {
      const tid = tenantId!;
      const [inv, po, adj] = await Promise.all([
        supabase.from("invoice_lines")
          .select("id, qty, unit_price, line_total, invoices!inner(id, invoice_number, invoice_date, status, tenant_id, customers(name))")
          .eq("item_id", itemId).eq("invoices.tenant_id", tid),
        supabase.from("purchase_order_lines")
          .select("id, qty, unit_price, line_total, purchase_orders!inner(id, po_number, order_date, status, tenant_id, suppliers(name))")
          .eq("item_id", itemId).eq("purchase_orders.tenant_id", tid),
        supabase.from("inventory_adjustment_lines")
          .select("id, qty_before, qty_after, variance, inventory_adjustments!inner(id, adjustment_number, adjustment_date, adjustment_type, reason, tenant_id, created_by)")
          .eq("item_id", itemId).eq("inventory_adjustments.tenant_id", tid),
      ]);
      if (inv.error) throw inv.error;
      if (po.error) throw po.error;
      if (adj.error) throw adj.error;
      return { invoices: inv.data ?? [], pos: po.data ?? [], adjustments: adj.data ?? [] };
    },
  });

  // Actor names for the timeline.
  const actorIds = Array.from(new Set([item?.created_by, ...(txData?.adjustments ?? []).map((a: any) => a.inventory_adjustments?.created_by)].filter(Boolean))) as string[];
  const { data: actors } = useQuery({
    enabled: actorIds.length > 0,
    queryKey: ["item-actors", actorIds.sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", actorIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.user_id] = p.full_name || p.email || "User"; });
      return map;
    },
  });
  const actorName = (id?: string | null) => (id && actors?.[id]) || "System";

  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("items").update({ is_active: active }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item updated");
      qc.invalidateQueries({ queryKey: ["item", itemId] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="grid place-items-center p-16 text-center">
        <Package className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-semibold">Item not found</p>
        <Link to="/items" className="mt-3 text-sm text-primary hover:underline">Back to items</Link>
      </div>
    );
  }

  const typeLabel = item.item_type === "inventory" ? "Inventory Items" : item.item_type === "service" ? "Service" : "Non-Inventory";
  const stock = Number(item.stock_on_hand ?? 0);
  const reorder = Number(item.reorder_level ?? 0);
  const isLow = item.item_type === "inventory" && reorder > 0 && stock <= reorder;

  // Build timeline events
  const timeline: { kind: string; ts: string; title: string; meta?: string; actor?: string; icon: any }[] = [];
  timeline.push({
    kind: "created", ts: item.created_at, icon: Plus,
    title: "Item created", actor: actorName(item.created_by),
  });
  if (item.updated_at && item.updated_at !== item.created_at) {
    timeline.push({
      kind: "updated", ts: item.updated_at, icon: PencilIcon,
      title: "Item updated", actor: actorName(item.created_by),
    });
  }
  (txData?.adjustments ?? []).forEach((a: any) => {
    const adj = a.inventory_adjustments;
    timeline.push({
      kind: "adjustment", ts: adj.adjustment_date, icon: ArrowLeftRight,
      title: `Stock ${adj.adjustment_type ?? "adjustment"} ${adj.adjustment_number ?? ""}`.trim(),
      meta: `${Number(a.qty_before).toFixed(2)} → ${Number(a.qty_after).toFixed(2)} (${Number(a.variance) >= 0 ? "+" : ""}${Number(a.variance).toFixed(2)})`,
      actor: actorName(adj.created_by),
    });
  });
  timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/items" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{item.name}</h1>
              {isLow && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Low stock
                </Badge>
              )}
              {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Returnable Item
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" className="bg-primary" onClick={() => navigate({ to: "/inventory-adjustments" })}>Adjust Stock</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                More <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toggleActive.mutate(!item.is_active)}>
                {item.is_active ? "Mark Inactive" : "Mark Active"}
              </DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/items" })}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex flex-1 flex-col">
        <div className="border-b bg-background px-6">
          <TabsList className="h-11 gap-2 bg-transparent p-0">
            {["overview", "warehouses", "batches", "transactions", "history"].map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-3 capitalize data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                {t === "batches" ? "Batch Details" : t === "history" ? "Activity" : t}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="flex-1 overflow-auto p-6 m-0">
          {isLow && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Low stock</p>
                <p className="text-muted-foreground">
                  Available {stock.toFixed(2)} {item.unit} is at or below the reorder point of {reorder.toFixed(2)}.
                </p>
              </div>
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-8">
              <DetailGrid rows={[
                ["Item Type", typeLabel],
                ["SKU", item.sku || "—"],
                ["Unit", item.unit || "—"],
                ["Barcode", item.barcode || "—"],
                ["Category", item.category || "—"],
                ["Created Source", "User"],
                ["Status", item.is_active ? "Active" : "Inactive"],
              ]} />
              <Section title="Purchase Information">
                <DetailGrid rows={[
                  ["Cost Price", item.cost_price != null ? formatCurrency(Number(item.cost_price), currency) : "—"],
                  ["Purchase Account", "Cost of Goods Sold"],
                  ["Tax Rule", "Standard"],
                ]} />
              </Section>
              <Section title="Sales Information">
                <DetailGrid rows={[
                  ["Selling Price", item.selling_price != null ? formatCurrency(Number(item.selling_price), currency) : "—"],
                  ["Sales Account", "Sales Revenue"],
                  ["Tax Rule", "Standard"],
                  ["Description", item.description || "—"],
                ]} />
              </Section>
              <Section title="Reporting Tags">
                <p className="text-sm text-muted-foreground">No reporting tag has been associated with this item.</p>
              </Section>
              <button className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Associated Price Lists <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid h-44 place-items-center rounded-md border-2 border-dashed bg-muted/30 text-center">
                <div>
                  <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-medium text-primary">Browse images</p>
                  <p className="mt-1 px-6 text-xs text-muted-foreground">Up to 15 images, each 5 MB max and 7000×7000 pixels.</p>
                </div>
              </div>

              <div className="rounded-md border">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm text-primary">Opening Stock</span>
                  <span className="text-sm font-semibold tabular-nums">0.00</span>
                </div>

                <StockBlock title="Accounting Stock" rows={[
                  ["Stock on Hand", stock.toFixed(2), true],
                  ["Committed Stock", "0.00"],
                  ["Available for Sale", stock.toFixed(2)],
                ]} />
                <StockBlock title="Physical Stock" rows={[
                  ["Stock on Hand", stock.toFixed(2)],
                  ["Committed Stock", "0.00"],
                  ["Available for Sale", stock.toFixed(2)],
                ]} />

                <div className="grid grid-cols-2 gap-3 p-4">
                  <QtyCard label="To be Shipped" />
                  <QtyCard label="To be Received" />
                  <QtyCard label="To be Invoiced" />
                  <QtyCard label="To be Billed" />
                </div>

                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-sm">Reorder Point</p>
                  <p className={"text-sm font-medium tabular-nums " + (isLow ? "text-destructive" : "")}>
                    {reorder > 0 ? reorder.toFixed(2) : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* WAREHOUSES */}
        <TabsContent value="warehouses" className="flex-1 m-0 p-6 overflow-auto">
          <div className="rounded-md border">
            <div className="grid grid-cols-[1fr_140px_140px_140px] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Warehouse</span>
              <span className="text-right">Stock on Hand</span>
              <span className="text-right">Committed</span>
              <span className="text-right">Available</span>
            </div>
            <div className="grid grid-cols-[1fr_140px_140px_140px] gap-4 px-4 py-3 text-sm">
              <span className="font-medium">Primary Warehouse <Badge variant="secondary" className="ml-2">Default</Badge></span>
              <span className="text-right tabular-nums">{stock.toFixed(2)}</span>
              <span className="text-right tabular-nums">0.00</span>
              <span className="text-right tabular-nums">{stock.toFixed(2)}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Multi-warehouse tracking is not enabled. Stock is consolidated in the default warehouse.
          </p>
        </TabsContent>

        {/* BATCHES */}
        <TabsContent value="batches" className="flex-1 m-0 p-6 overflow-auto">
          <EmptyState
            icon={Package}
            title="No batch tracking on this item"
            description="Enable batch tracking in item settings to monitor lot numbers, expiry dates, and per-batch stock."
          />
        </TabsContent>

        {/* TRANSACTIONS */}
        <TabsContent value="transactions" className="flex-1 m-0 p-6 overflow-auto">
          <TransactionsList
            invoices={txData?.invoices ?? []}
            pos={txData?.pos ?? []}
            adjustments={txData?.adjustments ?? []}
            currency={currency}
          />
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="history" className="flex-1 m-0 p-6 overflow-auto">
          {timeline.length === 0 ? (
            <EmptyState icon={Activity} title="No activity yet" description="Updates and stock movements will appear here." />
          ) : (
            <ol className="relative ml-3 border-l">
              {timeline.map((ev, i) => (
                <li key={i} className="mb-6 ml-6">
                  <span className="absolute -left-3 grid h-6 w-6 place-items-center rounded-full border bg-background">
                    <ev.icon className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">{ev.title}</p>
                    <time className="shrink-0 text-xs text-muted-foreground" title={format(new Date(ev.ts), "PPpp")}>
                      {formatDistanceToNow(new Date(ev.ts), { addSuffix: true })}
                    </time>
                  </div>
                  {ev.meta && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{ev.meta}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">by {ev.actor}</p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>

      <EditItemDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        item={item}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["item", itemId] });
          qc.invalidateQueries({ queryKey: ["items"] });
        }}
      />
    </div>
  );
}

function TransactionsList({
  invoices, pos, adjustments, currency,
}: {
  invoices: any[]; pos: any[]; adjustments: any[]; currency: string;
}) {
  type Row = { ts: string; type: string; doc: string; party: string; qty: string; amount: string; status: string; icon: any };
  const rows: Row[] = [];
  invoices.forEach((l: any) => {
    const inv = l.invoices;
    rows.push({
      ts: inv.invoice_date, type: "Invoice", doc: inv.invoice_number ?? "—",
      party: inv.customers?.name ?? "—",
      qty: `${Number(l.qty ?? 0).toFixed(2)}`,
      amount: formatCurrency(Number(l.line_total ?? 0), currency),
      status: inv.status ?? "—", icon: FileText,
    });
  });
  pos.forEach((l: any) => {
    const po = l.purchase_orders;
    rows.push({
      ts: po.order_date, type: "Purchase Order", doc: po.po_number ?? "—",
      party: po.suppliers?.name ?? "—",
      qty: `${Number(l.qty ?? 0).toFixed(2)}`,
      amount: formatCurrency(Number(l.line_total ?? 0), currency),
      status: po.status ?? "—", icon: ShoppingCart,
    });
  });
  adjustments.forEach((l: any) => {
    const a = l.inventory_adjustments;
    const v = Number(l.variance ?? 0);
    rows.push({
      ts: a.adjustment_date, type: "Adjustment", doc: a.adjustment_number ?? "—",
      party: a.reason ?? a.adjustment_type ?? "—",
      qty: `${v >= 0 ? "+" : ""}${v.toFixed(2)}`,
      amount: "—", status: a.adjustment_type ?? "—", icon: ArrowLeftRight,
    });
  });
  rows.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (rows.length === 0) {
    return <EmptyState icon={FileText} title="No transactions yet" description="Invoices, purchase orders, and stock adjustments referencing this item will appear here." />;
  }
  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[140px_140px_1.2fr_1fr_120px_140px_100px] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>Date</span><span>Type</span><span>Reference</span><span>Party</span>
        <span className="text-right">Qty</span><span className="text-right">Amount</span><span>Status</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[140px_140px_1.2fr_1fr_120px_140px_100px] gap-4 border-b px-4 py-2.5 text-sm last:border-b-0">
          <span className="text-muted-foreground">{r.ts ? format(new Date(r.ts), "MMM d, yyyy") : "—"}</span>
          <span className="inline-flex items-center gap-1.5"><r.icon className="h-3.5 w-3.5 text-muted-foreground" />{r.type}</span>
          <span className="font-medium text-primary truncate">{r.doc}</span>
          <span className="truncate text-muted-foreground">{r.party}</span>
          <span className="text-right tabular-nums">{r.qty}</span>
          <span className="text-right tabular-nums">{r.amount}</span>
          <span className="capitalize text-muted-foreground">{r.status}</span>
        </div>
      ))}
    </div>
  );
}

function EditItemDialog({
  open, onOpenChange, item, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; item: any; onSaved: () => void;
}) {
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: item.name ?? "",
      sku: item.sku ?? "",
      unit: item.unit ?? "unit",
      reorder_level: Number(item.reorder_level ?? 0),
    },
    values: {
      name: item.name ?? "",
      sku: item.sku ?? "",
      unit: item.unit ?? "unit",
      reorder_level: Number(item.reorder_level ?? 0),
    },
  });

  const save = useMutation({
    mutationFn: async (v: EditValues) => {
      // SKU uniqueness within tenant (excluding this item)
      if (v.sku && v.sku.trim()) {
        const { data: dup, error: dupErr } = await supabase
          .from("items").select("id").eq("tenant_id", item.tenant_id)
          .eq("sku", v.sku.trim()).neq("id", item.id).is("deleted_at", null).maybeSingle();
        if (dupErr) throw dupErr;
        if (dup) throw new Error("SKU already in use");
      }
      const { error } = await supabase.from("items").update({
        name: v.name.trim(),
        sku: v.sku?.trim() || null,
        unit: v.unit.trim(),
        reorder_level: v.reorder_level,
      }).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item saved");
      onOpenChange(false);
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit item</DialogTitle></DialogHeader>
        <form
          id="edit-item-form"
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register("name")} />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" {...form.register("sku")} />
            {form.formState.errors.sku && <p className="text-xs text-destructive">{form.formState.errors.sku.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" {...form.register("unit")} />
              {form.formState.errors.unit && <p className="text-xs text-destructive">{form.formState.errors.unit.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reorder">Reorder point</Label>
              <Input id="reorder" type="number" step="0.01" min="0" {...form.register("reorder_level")} />
              {form.formState.errors.reorder_level && <p className="text-xs text-destructive">{form.formState.errors.reorder_level.message}</p>}
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form="edit-item-form" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="grid place-items-center rounded-md border-2 border-dashed py-20 text-center text-muted-foreground">
      <Icon className="mb-3 h-8 w-8" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md px-4 text-xs">{description}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[180px_1fr] gap-y-2.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function StockBlock({ title, rows }: { title: string; rows: ([string, string] | [string, string, boolean])[] }) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <dl className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r[0]} className="flex items-center justify-between">
            <dt className="text-muted-foreground underline-offset-2 hover:underline">{r[0]}</dt>
            <dd className={r[2] ? "tabular-nums text-primary" : "tabular-nums"}>: {r[1]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QtyCard({ label }: { label: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2.5">
      <p className="text-xl font-semibold tabular-nums">0</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Qty</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
