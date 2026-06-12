import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Search, Loader2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

export function ItemsMiniList() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const itemsQ = useQuery({
    enabled: !!tenantId,
    queryKey: ["items", tenantId, "mini"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items").select("id,name,sku,is_active,archived_at,item_type")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const archive = useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore: boolean }) => {
      const { error } = await supabase
        .from("items")
        .update({ archived_at: restore ? null : new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("items").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (itemsQ.data ?? []).filter((r: any) => {
      if (!showArchived && r.archived_at) return false;
      if (!term) return true;
      return [r.name, r.sku].some((v) => v && String(v).toLowerCase().includes(term));
    }).slice(0, 20);
  }, [itemsQ.data, q, showArchived]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Items</h2>
          <p className="text-xs text-muted-foreground">Quick view of items. <Link to="/items" className="text-primary underline">Open full Items module →</Link></p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-7 w-48" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/items/new"><Plus className="h-4 w-4" /> New item</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Name</th>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">SKU</th>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Type</th>
              <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide">Status</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {itemsQ.isLoading ? (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /></td></tr>
            ) : !rows.length ? (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No items.</td></tr>
            ) : rows.map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-muted/20">
                <td className="px-3 py-2">
                  <Link to="/items/$itemId" params={{ itemId: r.id }} className="text-primary hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.sku ?? "—"}</td>
                <td className="px-3 py-2 capitalize">{r.item_type}</td>
                <td className="px-3 py-2">
                  {r.archived_at ? (
                    <span className="text-xs rounded bg-muted px-1.5 py-0.5">Archived</span>
                  ) : r.is_active ? (
                    <span className="text-xs rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-1.5 py-0.5">Active</span>
                  ) : (
                    <span className="text-xs rounded bg-muted px-1.5 py-0.5">Inactive</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild><Link to="/items/$itemId/edit" params={{ itemId: r.id }}><Pencil className="h-4 w-4 mr-2" /> Edit</Link></DropdownMenuItem>
                      <DropdownMenuItem onClick={() => archive.mutate({ id: r.id, restore: !!r.archived_at })}>
                        {r.archived_at ? <><ArchiveRestore className="h-4 w-4 mr-2" /> Unarchive</> : <><Archive className="h-4 w-4 mr-2" /> Archive</>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteId(r.id)} className="text-rose-500 focus:text-rose-500">
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the item. Existing invoices and bills referencing it will keep their values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try { await del.mutateAsync(deleteId); toast.success("Item deleted"); }
                catch (e: any) { toast.error(e.message ?? "Delete failed"); }
                finally { setDeleteId(null); }
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
