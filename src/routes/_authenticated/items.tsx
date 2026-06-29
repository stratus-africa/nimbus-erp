import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMemo, useState } from "react";
import { ChevronDown, Plus, MoreHorizontal, SlidersHorizontal, Search, RefreshCw, ImageIcon, Pencil, Archive, ArchiveRestore, Trash2, Upload } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ItemsCsvImportDialog } from "@/components/items/items-csv-import-dialog";

export const Route = createFileRoute("/_authenticated/items")({
  head: () => ({ meta: [{ title: "Items — Nimbus ERP" }] }),
  component: ItemsPage,
});

type FilterKey = "all" | "active" | "inactive" | "inventory" | "service" | "low" | "archived";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All Items" },
  { key: "active", label: "Active Items" },
  { key: "inactive", label: "Inactive Items" },
  { key: "inventory", label: "Inventory Items" },
  { key: "service", label: "Service Items" },
  { key: "low", label: "Low Stock Items" },
  { key: "archived", label: "Archived Items" },
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
      if (filter === "archived") {
        if (!r.archived_at) return false;
      } else if (r.archived_at) {
        return false; // hide archived from all other filters
      }
      if (filter === "inventory" && r.item_type !== "inventory") return false;
      if (filter === "service" && r.item_type !== "service") return false;
      if (filter === "low" && !(r.item_type === "inventory" && Number(r.stock_on_hand ?? 0) <= Number(r.reorder_level ?? 0))) return false;
      if (filter === "inactive" && r.is_active !== false) return false;
      if (filter === "active" && r.is_active === false) return false;
      if (!q) return true;
      return [r.name, r.sku, r.description, r.barcode].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [rows, filter, query]);

  const archive = useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore: boolean }) => {
      const { error } = await supabase
        .from("items")
        .update({ archived_at: restore ? null : new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success(v.restore ? "Item unarchived" : "Item archived");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_item", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      toast.success("Item deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const allChecked = filtered.length > 0 && filtered.every((r: any) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((r: any) => r.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const openNew = () => navigate({ to: "/items/new" });

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
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import
          </Button>
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
              <DropdownMenuItem onClick={() => setImportOpen(true)}>Import Items</DropdownMenuItem>
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
              <TableHead className="pr-6 text-right uppercase text-xs tracking-wide">Actions</TableHead>
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
                className={cn("group", selected.has(i.id) && "bg-primary/5", i.archived_at && "opacity-60")}
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
                    onClick={() => navigate({ to: "/items/$itemId", params: { itemId: i.id } })}
                    className="text-primary hover:underline font-normal text-left inline-flex items-center gap-2"
                  >
                    {i.name}
                    {i.archived_at && <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">Archived</span>}
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
                <TableCell className="pr-6 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to="/items/$itemId/edit" params={{ itemId: i.id }}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => archive.mutate({ id: i.id, restore: !!i.archived_at })}>
                        {i.archived_at ? <><ArchiveRestore className="h-4 w-4 mr-2" /> Unarchive</> : <><Archive className="h-4 w-4 mr-2" /> Archive</>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteId(i.id)}
                        className="text-rose-500 focus:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the item. Existing invoices and bills referencing it are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) { del.mutate(deleteId); setDeleteId(null); } }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ItemsCsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}



