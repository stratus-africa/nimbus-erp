import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, MoreHorizontal, SlidersHorizontal, Search, RefreshCw, ImageIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/items")({
  head: () => ({ meta: [{ title: "Items — Nimbus ERP" }] }),
  component: ItemsPage,
});

type Item = {
  id?: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  item_type: "inventory" | "service" | "non_inventory";
  unit?: string | null;
  selling_price?: number | null;
  cost_price?: number | null;
  reorder_level?: number | null;
};

type FilterKey = "all" | "active" | "inactive" | "inventory" | "service" | "low";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All Items" },
  { key: "active", label: "Active Items" },
  { key: "inactive", label: "Inactive Items" },
  { key: "inventory", label: "Inventory Items" },
  { key: "service", label: "Service Items" },
  { key: "low", label: "Low Stock Items" },
];

function ItemsPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "USD";
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["items", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items").select("*").eq("tenant_id", tenantId!).is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r: any) => {
      if (filter === "inventory" && r.item_type !== "inventory") return false;
      if (filter === "service" && r.item_type !== "service") return false;
      if (filter === "low" && !(r.item_type === "inventory" && Number(r.stock_on_hand ?? 0) <= Number(r.reorder_level ?? 0))) return false;
      if (filter === "inactive" && r.is_active !== false) return false;
      if (filter === "active" && r.is_active === false) return false;
      if (!q) return true;
      return [r.name, r.sku, r.description].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [rows, filter, query]);

  const allChecked = filtered.length > 0 && filtered.every((r: any) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((r: any) => r.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const upsert = useMutation({
    mutationFn: async (i: Item) => {
      const payload: any = { ...i, tenant_id: tenantId! };
      const { error } = i.id
        ? await supabase.from("items").update(payload).eq("id", i.id)
        : await supabase.from("items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Saved");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing({ name: "", item_type: "inventory" }); setDialogOpen(true); };
  const openEdit = (i: Item) => { setEditing(i); setDialogOpen(true); };

  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "All Items";

  return (
    <div className="-m-6">
      {/* Top utility bar */}
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => qc.invalidateQueries({ queryKey: ["items"] })}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in Items ( / )"
            className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
          />
        </div>
      </div>

      {/* Header row */}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => qc.invalidateQueries({ queryKey: ["items"] })}>Refresh</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Import Items</DropdownMenuItem>
              <DropdownMenuItem>Export Items</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="border-t bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 pl-6">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
              </TableHead>
              <TableHead className="w-10">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead className="w-14"></TableHead>
              <TableHead className="uppercase text-xs tracking-wide">Name</TableHead>
              <TableHead className="uppercase text-xs tracking-wide">SKU</TableHead>
              <TableHead className="uppercase text-xs tracking-wide text-right">Purchase Rate</TableHead>
              <TableHead className="uppercase text-xs tracking-wide text-right">Rate</TableHead>
              <TableHead className="uppercase text-xs tracking-wide text-right">Stock on Hand</TableHead>
              <TableHead className="uppercase text-xs tracking-wide">Usage Unit</TableHead>
              <TableHead className="pr-6 text-right">
                <Search className="ml-auto h-4 w-4 text-muted-foreground" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !filtered.length ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">No items found.</TableCell></TableRow>
            ) : filtered.map((i: any) => (
              <TableRow
                key={i.id}
                className={cn("group", selected.has(i.id) && "bg-primary/5")}
              >
                <TableCell className="pl-6"></TableCell>
                <TableCell>
                  <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleOne(i.id)} />
                </TableCell>
                <TableCell>
                  <div className="grid h-9 w-9 place-items-center rounded border bg-muted/40 text-muted-foreground">
                    <ImageIcon className="h-4 w-4" />
                  </div>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => openEdit(i)}
                    className="text-primary hover:underline font-normal text-left"
                  >
                    {i.name}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{i.sku ?? ""}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {i.cost_price != null && Number(i.cost_price) > 0
                    ? formatCurrency(i.cost_price, currency)
                    : "0"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {i.selling_price != null && Number(i.selling_price) > 0
                    ? formatCurrency(i.selling_price, currency)
                    : "0"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {i.item_type === "inventory" ? Number(i.stock_on_hand ?? 0) : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">{i.unit ?? ""}</TableCell>
                <TableCell className="pr-6"></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={(i) => upsert.mutate(i)}
        saving={upsert.isPending}
      />
    </div>
  );
}

function ItemDialog({ open, onOpenChange, initial, onSubmit, saving }: { open: boolean; onOpenChange: (v: boolean) => void; initial: Item | null; onSubmit: (i: Item) => void; saving: boolean }) {
  const [i, setI] = useState<Item>({ name: "", item_type: "inventory" });
  useEffect(() => { setI(initial ?? { name: "", item_type: "inventory" }); }, [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{i.id ? "Edit item" : "New item"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label>Name *</Label><Input value={i.name} onChange={(e) => setI({ ...i, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>SKU</Label><Input value={i.sku ?? ""} onChange={(e) => setI({ ...i, sku: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={i.item_type} onValueChange={(v: any) => setI({ ...i, item_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="non_inventory">Non-inventory</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Usage Unit</Label><Input value={i.unit ?? ""} onChange={(e) => setI({ ...i, unit: e.target.value })} placeholder="pcs, hrs, kg…" /></div>
          <div className="space-y-2"><Label>Rate (Selling)</Label><Input type="number" step="0.01" value={i.selling_price ?? ""} onChange={(e) => setI({ ...i, selling_price: parseFloat(e.target.value) || 0 })} /></div>
          <div className="space-y-2"><Label>Purchase Rate (Cost)</Label><Input type="number" step="0.01" value={i.cost_price ?? ""} onChange={(e) => setI({ ...i, cost_price: parseFloat(e.target.value) || 0 })} /></div>
          <div className="space-y-2"><Label>Reorder Level</Label><Input type="number" step="0.01" value={i.reorder_level ?? ""} onChange={(e) => setI({ ...i, reorder_level: parseFloat(e.target.value) || 0 })} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea value={i.description ?? ""} onChange={(e) => setI({ ...i, description: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!i.name || saving} onClick={() => onSubmit(i)}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
