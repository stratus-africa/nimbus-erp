import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, RefreshCw, Factory, Search, X, Trash2, XCircle, CheckCircle2, Filter } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/production-orders")({
  head: () => ({ meta: [{ title: "Production Orders — Nimbus ERP" }] }),
  component: ProductionOrdersPage,
});

const STATUSES = ["draft", "in_progress", "completed", "cancelled"] as const;

function ProductionOrdersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["production-orders", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("assembly_orders")
        .select("id, order_number, status, quantity, completed_at, created_at, assembly_item_id, items:assembly_item_id(name, sku)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 86400000 : null;
    return (rows ?? []).filter((r: any) => {
      if (status !== "all" && r.status !== status) return false;
      const created = new Date(r.created_at).getTime();
      if (from && created < from) return false;
      if (to && created >= to) return false;
      if (s) {
        const hay = `${r.order_number ?? ""} ${r.items?.name ?? ""} ${r.items?.sku ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, status, dateFrom, dateTo]);

  const hasFilters = search || status !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setSearch(""); setStatus("all"); setDateFrom(""); setDateTo(""); };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r: any) => r.id)));
  };
  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const bulkCancel = async () => {
    const ids = [...selected];
    const targets = filtered.filter((r: any) => selected.has(r.id) && r.status !== "completed" && r.status !== "cancelled");
    if (!targets.length) return toast.error("No cancellable orders in selection");
    if (!confirm(`Cancel ${targets.length} production order(s)?`)) return;
    const { error } = await (supabase as any).from("assembly_orders")
      .update({ status: "cancelled" }).in("id", targets.map((t: any) => t.id));
    if (error) return toast.error(error.message);
    toast.success(`Cancelled ${targets.length} order(s)`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["production-orders"] });
  };

  const bulkDelete = async () => {
    const targets = filtered.filter((r: any) => selected.has(r.id) && r.status !== "completed");
    if (!targets.length) return toast.error("Completed orders cannot be deleted");
    if (!confirm(`Delete ${targets.length} production order(s)? This cannot be undone.`)) return;
    const { error } = await (supabase as any).from("assembly_orders").delete().in("id", targets.map((t: any) => t.id));
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${targets.length} order(s)`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["production-orders"] });
  };

  const bulkComplete = async () => {
    const targets = filtered.filter((r: any) => selected.has(r.id) && (r.status === "draft" || r.status === "in_progress"));
    if (!targets.length) return toast.error("No completable orders in selection");
    if (!confirm(`Complete ${targets.length} production order(s)? Components will be consumed.`)) return;
    let ok = 0, fail = 0;
    for (const t of targets) {
      const { error } = await supabase.rpc("complete_assembly_order", { _id: t.id });
      if (error) fail++; else ok++;
    }
    toast[fail ? "warning" : "success"](`Completed ${ok}${fail ? `, ${fail} failed` : ""}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["production-orders"] });
  };

  const { can } = usePermissions();
  const canCreate = can("production", "create");
  const canEdit = can("production", "edit");
  const canDelete = can("production", "delete");
  const canApprove = can("production", "approve");
  const showDashboard = canApprove || can("production", "export");

  const kpis = useMemo(() => {
    const list = rows ?? [];
    const draft = list.filter((r: any) => r.status === "draft");
    const inProgress = list.filter((r: any) => r.status === "in_progress");
    const completed = list.filter((r: any) => r.status === "completed");
    const cancelled = list.filter((r: any) => r.status === "cancelled");
    const inProgressQty = inProgress.reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0);
    const completedQty = completed.reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0);
    const last30 = Date.now() - 30 * 86400000;
    const completed30 = completed.filter((r: any) => r.completed_at && new Date(r.completed_at).getTime() >= last30);
    return {
      total: list.length,
      draft: draft.length,
      inProgress: inProgress.length,
      completed: completed.length,
      cancelled: cancelled.length,
      inProgressQty,
      completedQty,
      completed30: completed30.length,
    };
  }, [rows]);

  return (
    <div className="-m-6">
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => qc.invalidateQueries({ queryKey: ["production-orders"] })} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Factory className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Production Orders</h1>
        </div>
        {canCreate && (
          <Button onClick={() => navigate({ to: "/production-orders/new" })} className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4" /> New Production Order
          </Button>
        )}
      </div>

      {showDashboard && (
        <div className="grid gap-3 border-b bg-muted/20 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "In Progress", value: kpis.inProgress, sub: `${kpis.inProgressQty} units` },
            { label: "Completed (30d)", value: kpis.completed30, sub: `${kpis.completedQty} total units` },
            { label: "Draft", value: kpis.draft, sub: "awaiting start" },
            { label: "Cancelled", value: kpis.cancelled, sub: `${kpis.total} orders total` },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="py-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
                <div className="text-xs text-muted-foreground">{k.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}


      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search order # or item…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-64" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 gap-1.5">
              <Filter className="h-4 w-4" />
              {dateFrom || dateTo ? `${dateFrom || "…"} → ${dateTo || "…"}` : "Date range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </PopoverContent>
        </Popover>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1">
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
        <div className="ml-auto text-sm text-muted-foreground">{filtered.length} of {rows?.length ?? 0}</div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-y bg-muted/40 px-6 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={bulkComplete}><CheckCircle2 className="h-4 w-4 mr-1.5" /> Complete</Button>
          <Button size="sm" variant="outline" onClick={bulkCancel}><XCircle className="h-4 w-4 mr-1.5" /> Cancel</Button>
          <Button size="sm" variant="outline" onClick={bulkDelete} className="text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4 mr-1.5" /> Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="border-t bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-6">
                <Checkbox
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !filtered.length ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                {hasFilters ? "No orders match filters." : "No production orders yet."}
              </TableCell></TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                <TableCell className="pl-6">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                </TableCell>
                <TableCell>
                  <Link to="/production-orders/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.order_number ?? r.id.slice(0, 8)}</Link>
                </TableCell>
                <TableCell>{r.items?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.items?.sku ?? ""}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.quantity)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "completed" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"} className="capitalize">{r.status?.replace("_"," ")}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                <TableCell className="text-muted-foreground">{r.completed_at ? formatDate(r.completed_at) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
