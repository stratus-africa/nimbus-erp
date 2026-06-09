import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import {
  ArrowLeft,
  Pencil,
  X,
  ImageIcon,
  Package,
  RotateCcw,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/items/$itemId")({
  head: () => ({ meta: [{ title: "Item — Nimbus ERP" }] }),
  component: ItemViewPage,
});

function ItemViewPage() {
  const { itemId } = useParams({ from: "/_authenticated/items/$itemId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const currency = profile?.currentTenant?.base_currency ?? "USD";

  const { data: item, isLoading } = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("id", itemId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase
        .from("items")
        .update({ is_active: active })
        .eq("id", itemId);
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
        <Link to="/items" className="mt-3 text-sm text-primary hover:underline">
          Back to items
        </Link>
      </div>
    );
  }

  const typeLabel =
    item.item_type === "inventory"
      ? "Inventory Items"
      : item.item_type === "service"
      ? "Service"
      : "Non-Inventory";

  return (
    <div className="flex h-full flex-col">
      {/* Top action bar */}
      <div className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/items" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{item.name}</h1>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Returnable Item
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" className="bg-primary">Adjust Stock</Button>
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
                {t === "batches" ? "Batch Details" : t}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 overflow-auto p-6 m-0">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            {/* LEFT */}
            <div className="space-y-8">
              <DetailGrid
                rows={[
                  ["Item Type", typeLabel],
                  ["SKU", item.sku || "—"],
                  ["Unit", item.unit || "—"],
                  ["Barcode", item.barcode || "—"],
                  ["Category", item.category || "—"],
                  ["Created Source", "User"],
                  ["Status", item.is_active ? "Active" : "Inactive"],
                ]}
              />

              <Section title="Purchase Information">
                <DetailGrid
                  rows={[
                    ["Cost Price", item.cost_price != null ? formatCurrency(Number(item.cost_price), currency) : "—"],
                    ["Purchase Account", "Cost of Goods Sold"],
                    ["Tax Rule", "Standard"],
                  ]}
                />
              </Section>

              <Section title="Sales Information">
                <DetailGrid
                  rows={[
                    ["Selling Price", item.selling_price != null ? formatCurrency(Number(item.selling_price), currency) : "—"],
                    ["Sales Account", "Sales Revenue"],
                    ["Tax Rule", "Standard"],
                    ["Description", item.description || "—"],
                  ]}
                />
              </Section>

              <Section title="Reporting Tags">
                <p className="text-sm text-muted-foreground">
                  No reporting tag has been associated with this item.
                </p>
              </Section>

              <button className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Associated Price Lists <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* RIGHT */}
            <div className="space-y-6">
              <div className="grid h-44 place-items-center rounded-md border-2 border-dashed bg-muted/30 text-center">
                <div>
                  <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-medium text-primary">Browse images</p>
                  <p className="mt-1 px-6 text-xs text-muted-foreground">
                    Up to 15 images, each 5 MB max and 7000×7000 pixels.
                  </p>
                </div>
              </div>

              <div className="rounded-md border">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm text-primary">Opening Stock</span>
                  <span className="text-sm font-semibold tabular-nums">0.00</span>
                </div>

                <StockBlock
                  title="Accounting Stock"
                  rows={[
                    ["Stock on Hand", Number(item.stock_on_hand ?? 0).toFixed(2), true],
                    ["Committed Stock", "0.00"],
                    ["Available for Sale", "0.00"],
                  ]}
                />
                <StockBlock
                  title="Physical Stock"
                  rows={[
                    ["Stock on Hand", Number(item.stock_on_hand ?? 0).toFixed(2)],
                    ["Committed Stock", "0.00"],
                    ["Available for Sale", "0.00"],
                  ]}
                />

                <div className="grid grid-cols-2 gap-3 p-4">
                  <QtyCard label="To be Shipped" />
                  <QtyCard label="To be Received" />
                  <QtyCard label="To be Invoiced" />
                  <QtyCard label="To be Billed" />
                </div>

                <div className="border-t px-4 py-3">
                  <p className="text-sm">Reorder Point</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {item.reorder_level != null ? Number(item.reorder_level).toFixed(2) : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {["warehouses", "batches", "transactions", "history"].map((t) => (
          <TabsContent key={t} value={t} className="flex-1 m-0 p-10">
            <div className="grid place-items-center rounded-md border-2 border-dashed py-20 text-center text-muted-foreground">
              <Package className="mb-3 h-8 w-8" />
              <p className="text-sm">No {t === "batches" ? "batch details" : t} yet.</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
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
