import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, RefreshCw, ArrowLeftRight, Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transfer-orders")({
  head: () => ({ meta: [{ title: "Transfer Orders — Nimbus ERP" }] }),
  component: TransferOrdersPage,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", pending_approval: "outline", confirmed: "outline", shipped: "outline", received: "outline", completed: "default", cancelled: "destructive", rejected: "destructive",
};

function TransferOrdersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transfer_orders" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer order deleted");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["transfer-orders"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["transfer-orders", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_orders" as any)
        .select("id, transfer_number, transfer_date, status, source_warehouse_id, destination_warehouse_id, created_at, src:source_warehouse_id(name), dst:destination_warehouse_id(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const filtered = useMemo(() => rows.filter((r: any) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search && !r.transfer_number?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rows, search, statusFilter]);

  const exportCsv = () => {
    const header = ["Transfer #", "Date", "From", "To", "Status"];
    const lines = filtered.map((r: any) => [r.transfer_number, r.transfer_date, r.src?.name ?? "", r.dst?.name ?? "", r.status]);
    const csv = [header, ...lines].map((row) => row.map((c: any) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `transfer-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="-m-6">
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => qc.invalidateQueries({ queryKey: ["transfer-orders"] })} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Transfer Orders</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transfer #" className="h-9 w-56" />
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            {["draft","confirmed","shipped","received","completed","cancelled"].map(s => <option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}
          </select>
          <Button onClick={() => navigate({ to: "/transfer-orders/new" })} className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4" /> New Transfer Order
          </Button>
        </div>
      </div>

      <div className="border-t bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Transfer #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>From Warehouse</TableHead>
              <TableHead>To Warehouse</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !filtered.length ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No transfer orders yet.</TableCell></TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="pl-6">
                  <Link to="/transfer-orders/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.transfer_number}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.transfer_date)}</TableCell>
                <TableCell>{r.src?.name ?? "—"}</TableCell>
                <TableCell>{r.dst?.name ?? "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "secondary"} className="capitalize">{r.status}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                <TableCell className="text-right pr-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate({ to: "/transfer-orders/$id", params: { id: r.id } })}>
                        <Pencil className="mr-2 h-4 w-4" /> Open / Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transfer order?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the transfer order and its line items. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && del.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
