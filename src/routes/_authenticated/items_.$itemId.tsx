import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { useState } from "react";
import {
  ArrowLeft, Pencil, X, ImageIcon, Package, RotateCcw, MoreHorizontal,
  ChevronRight, AlertTriangle, FileText, ShoppingCart, ArrowLeftRight, Activity, Plus, Pencil as PencilIcon, Search,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/items_/$itemId")({
  head: () => ({ meta: [{ title: "Item — Nimbus ERP" }] }),
  component: ItemViewPage,
});

function ItemViewPage() {
  const { itemId } = useParams({ from: "/_authenticated/items_/$itemId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  
  const [sidebarSearch, setSidebarSearch] = useState("");

  const { data: allItems } = useQuery({
    enabled: !!tenantId,
    queryKey: ["items-sidebar", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items").select("id, name, sku, item_type, stock_on_hand, reorder_level, unit, is_active")
        .eq("tenant_id", tenantId!).is("deleted_at", null)
        .order("name", { ascending: true }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: warehouses = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["item-warehouses", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations" as any)
        .select("id, name, branch, city, is_primary, is_active")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const filteredSidebar = (allItems ?? []).filter((it: any) => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return true;
    return [it.name, it.sku].some((v) => v && String(v).toLowerCase().includes(q));
  });

  const Sidebar = (
    <aside className="hidden w-[300px] shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            placeholder="Search items"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate({ to: "/items/new" })} title="New item">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>All Items</span>
        <span>{filteredSidebar.length}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {filteredSidebar.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No items.</p>
        ) : filteredSidebar.map((it: any) => {
          const active = it.id === itemId;
          const low = it.item_type === "inventory" && Number(it.reorder_level ?? 0) > 0 && Number(it.stock_on_hand ?? 0) <= Number(it.reorder_level ?? 0);
          return (
            <button
              key={it.id}
              onClick={() => navigate({ to: "/items/$itemId", params: { itemId: it.id } })}
              className={`flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left text-sm transition hover:bg-muted/60 ${active ? "border-l-2 border-l-primary bg-primary/5" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{it.name}</span>
                {low && <Badge variant="destructive" className="h-4 px-1 text-[10px]">Low</Badge>}
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{it.sku || "—"}</span>
                <span className="tabular-nums">{it.item_type === "inventory" ? `${Number(it.stock_on_hand ?? 0)} ${it.unit ?? ""}` : it.item_type}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );

  const { data: item, isLoading } = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Transactions: pulled from every document type that can reference an item.
  const { data: txData } = useQuery({
    enabled: !!item && !!tenantId,
    queryKey: ["item-transactions", itemId, tenantId],
    queryFn: async () => {
      const tid = tenantId!;
      const [quote, so, inv, bill, po, adj] = await Promise.all([
        supabase.from("quote_lines")
          .select("id, quantity, rate, line_total, quotes!inner(id, quote_number, quote_date, status, tenant_id, customers(name))")
          .eq("item_id", itemId).eq("quotes.tenant_id", tid),
        supabase.from("sales_order_lines")
          .select("id, quantity, rate, line_total, sales_orders!inner(id, so_number, so_date, status, tenant_id, customers(name))")
          .eq("item_id", itemId).eq("sales_orders.tenant_id", tid),
        supabase.from("invoice_lines")
          .select("id, quantity, rate, line_total, invoices!inner(id, invoice_number, invoice_date, status, tenant_id, customers(name))")
          .eq("item_id", itemId).eq("invoices.tenant_id", tid),
        supabase.from("bill_lines")
          .select("id, quantity, rate, line_total, bills!inner(id, bill_number, bill_date, status, tenant_id, suppliers(name))")
          .eq("item_id", itemId).eq("bills.tenant_id", tid),
        supabase.from("purchase_order_lines")
          .select("id, quantity, rate, line_total, purchase_orders!inner(id, po_number, po_date, status, tenant_id, suppliers(name))")
          .eq("item_id", itemId).eq("purchase_orders.tenant_id", tid),
        supabase.from("inventory_adjustment_lines")
          .select("id, qty_before, qty_after, variance, inventory_adjustments!inner(id, adjustment_number, adjustment_date, adjustment_type, reason, tenant_id, created_by)")
          .eq("item_id", itemId).eq("inventory_adjustments.tenant_id", tid),
      ]);
      return {
        quotes: (quote.data as any[]) ?? [],
        salesOrders: (so.data as any[]) ?? [],
        invoices: (inv.data as any[]) ?? [],
        bills: (bill.data as any[]) ?? [],
        pos: (po.data as any[]) ?? [],
        adjustments: (adj.data as any[]) ?? [],
      };
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
      <div className="flex h-full bg-background">
        {Sidebar}
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex h-full bg-background">
        {Sidebar}
        <div className="grid flex-1 place-items-center p-16 text-center">
          <div>
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-semibold">Item not found</p>
            <Link to="/items" className="mt-3 inline-block text-sm text-primary hover:underline">Back to items</Link>
          </div>
        </div>
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
    <div className="flex h-full bg-background">
      {Sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
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
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/items/$itemId/edit" params={{ itemId }}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
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
          {warehouses.length === 0 ? (
            <EmptyState icon={Package} title="No warehouses configured" description="Add a location under Settings → Locations to track stock per warehouse." />
          ) : (
            <>
              <div className="rounded-md border">
                <div className="grid grid-cols-[1.4fr_140px_140px_140px] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Warehouse</span>
                  <span className="text-right">Stock on Hand</span>
                  <span className="text-right">Committed</span>
                  <span className="text-right">Available</span>
                </div>
                {warehouses.map((w: any) => {
                  const onHand = w.is_primary ? stock : 0;
                  return (
                    <div key={w.id} className="grid grid-cols-[1.4fr_140px_140px_140px] gap-4 border-b px-4 py-3 text-sm last:border-b-0">
                      <span className="font-medium">
                        {w.name}
                        {w.is_primary && <Badge variant="secondary" className="ml-2">Default</Badge>}
                        {w.branch && <span className="ml-2 text-xs text-muted-foreground">· {w.branch}</span>}
                      </span>
                      <span className="text-right tabular-nums">{onHand.toFixed(2)}</span>
                      <span className="text-right tabular-nums">0.00</span>
                      <span className="text-right tabular-nums">{onHand.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Stock currently sits in the default warehouse. Enable per-warehouse tracking to split quantities across locations.
              </p>
            </>
          )}
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
          <TransactionsList data={txData} currency={currency} />
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

     </div>
      </div>
    </div>
  );
}

type TxData = {
  quotes: any[]; salesOrders: any[]; invoices: any[];
  bills: any[]; pos: any[]; adjustments: any[];
};

const FILTER_OPTIONS = [
  "Quotes", "Sales Orders", "Invoices", "Credit Notes", "Packages", "Shipments",
  "Purchase Orders", "Purchase Receives", "Bills", "Supplier Credits",
  "Transfer Orders", "Inventory Adjustments", "Production",
] as const;
type FilterOption = (typeof FILTER_OPTIONS)[number];

function TransactionsList({ data, currency }: { data: TxData | undefined; currency: string }) {
  const [filter, setFilter] = useState<FilterOption>("Quotes");
  const [status, setStatus] = useState<string>("All");

  type Row = { ts: string; doc: string; party: string; qty: string; amount: string; status: string; icon: any };
  const rowsForFilter = (): Row[] => {
    if (!data) return [];
    switch (filter) {
      case "Quotes":
        return (data.quotes ?? []).map((l) => ({
          ts: l.quotes?.quote_date, doc: l.quotes?.quote_number ?? "—",
          party: l.quotes?.customers?.name ?? "—",
          qty: Number(l.quantity ?? 0).toFixed(2),
          amount: formatCurrency(Number(l.line_total ?? 0), currency),
          status: l.quotes?.status ?? "—", icon: FileText,
        }));
      case "Sales Orders":
        return (data.salesOrders ?? []).map((l) => ({
          ts: l.sales_orders?.so_date, doc: l.sales_orders?.so_number ?? "—",
          party: l.sales_orders?.customers?.name ?? "—",
          qty: Number(l.quantity ?? 0).toFixed(2),
          amount: formatCurrency(Number(l.line_total ?? 0), currency),
          status: l.sales_orders?.status ?? "—", icon: FileText,
        }));
      case "Invoices":
        return (data.invoices ?? []).map((l) => ({
          ts: l.invoices?.invoice_date, doc: l.invoices?.invoice_number ?? "—",
          party: l.invoices?.customers?.name ?? "—",
          qty: Number(l.quantity ?? 0).toFixed(2),
          amount: formatCurrency(Number(l.line_total ?? 0), currency),
          status: l.invoices?.status ?? "—", icon: FileText,
        }));
      case "Purchase Orders":
        return (data.pos ?? []).map((l) => ({
          ts: l.purchase_orders?.po_date, doc: l.purchase_orders?.po_number ?? "—",
          party: l.purchase_orders?.suppliers?.name ?? "—",
          qty: Number(l.quantity ?? 0).toFixed(2),
          amount: formatCurrency(Number(l.line_total ?? 0), currency),
          status: l.purchase_orders?.status ?? "—", icon: ShoppingCart,
        }));
      case "Bills":
        return (data.bills ?? []).map((l) => ({
          ts: l.bills?.bill_date, doc: l.bills?.bill_number ?? "—",
          party: l.bills?.suppliers?.name ?? "—",
          qty: Number(l.quantity ?? 0).toFixed(2),
          amount: formatCurrency(Number(l.line_total ?? 0), currency),
          status: l.bills?.status ?? "—", icon: ShoppingCart,
        }));
      case "Inventory Adjustments":
        return (data.adjustments ?? []).map((l) => {
          const v = Number(l.variance ?? 0);
          return {
            ts: l.inventory_adjustments?.adjustment_date,
            doc: l.inventory_adjustments?.adjustment_number ?? "—",
            party: l.inventory_adjustments?.reason ?? l.inventory_adjustments?.adjustment_type ?? "—",
            qty: `${v >= 0 ? "+" : ""}${v.toFixed(2)}`, amount: "—",
            status: l.inventory_adjustments?.adjustment_type ?? "—", icon: ArrowLeftRight,
          };
        });
      default:
        return [];
    }
  };

  const allRows = rowsForFilter().sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const statuses = ["All", ...Array.from(new Set(allRows.map((r) => r.status).filter((s) => s && s !== "—")))];
  const rows = status === "All" ? allRows : allRows.filter((r) => r.status === status);
  const emptyLabel = filter.toLowerCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <span className="text-muted-foreground">Filter By:</span>
              <span className="font-medium">{filter}</span>
              <ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {FILTER_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt}
                onClick={() => { setFilter(opt); setStatus("All"); }}
                className={filter === opt ? "bg-primary/10 text-primary" : ""}
              >
                {opt}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium capitalize">{status}</span>
              <ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {statuses.map((s) => (
              <DropdownMenuItem key={s} onClick={() => setStatus(s)} className={`capitalize ${status === s ? "bg-primary/10 text-primary" : ""}`}>
                {s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center py-24 text-sm text-muted-foreground">
          There are no {emptyLabel}
        </div>
      ) : (
        <div className="rounded-md border">
          <div className="grid grid-cols-[140px_1.2fr_1fr_120px_140px_120px] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Date</span><span>Reference</span><span>Party</span>
            <span className="text-right">Qty</span><span className="text-right">Amount</span><span>Status</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[140px_1.2fr_1fr_120px_140px_120px] gap-4 border-b px-4 py-2.5 text-sm last:border-b-0">
              <span className="text-muted-foreground">{r.ts ? format(new Date(r.ts), "MMM d, yyyy") : "—"}</span>
              <span className="font-medium text-primary truncate inline-flex items-center gap-1.5">
                <r.icon className="h-3.5 w-3.5 text-muted-foreground" />{r.doc}
              </span>
              <span className="truncate text-muted-foreground">{r.party}</span>
              <span className="text-right tabular-nums">{r.qty}</span>
              <span className="text-right tabular-nums">{r.amount}</span>
              <span className="capitalize text-muted-foreground">{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
