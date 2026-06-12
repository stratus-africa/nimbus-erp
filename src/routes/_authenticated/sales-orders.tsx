import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ChevronDown,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Paperclip,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales-orders")({
  head: () => ({ meta: [{ title: "Sales Orders — Nimbus ERP" }] }),
  component: SalesOrdersPage,
});

const STATUS_STYLES: Record<string, string> = {
  draft: "text-muted-foreground",
  confirmed: "text-sky-600",
  sent: "text-sky-600",
  partially_invoiced: "text-amber-600",
  invoiced: "text-emerald-600",
  closed: "text-emerald-600",
  cancelled: "text-rose-600",
};

const STATUS_DISPLAY: Record<string, string> = {
  partially_invoiced: "PARTIALLY INVOICED",
  invoiced: "CLOSED",
  closed: "CLOSED",
};

const VIEWS = [
  "All Sales Orders",
  "Draft",
  "Confirmed",
  "Sent",
  "Partially Invoiced",
  "Invoiced",
  "Closed",
  "Cancelled",
] as const;

function SalesOrdersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [view, setView] = useState<(typeof VIEWS)[number]>("All Sales Orders");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["sales-orders-list", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_orders")
        .select("*, customers(name)")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("so_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (view !== "All Sales Orders") {
      const target = view.toLowerCase().replace(/ /g, "_");
      list = list.filter((r: any) => r.status === target);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r: any) =>
          r.so_number?.toLowerCase().includes(q) ||
          r.customers?.name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, view, search]);

  const allChecked = filtered.length > 0 && filtered.every((r: any) => selected.has(r.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((r: any) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const openNew = () => navigate({ to: "/sales-orders/new" });
  const openRow = (r: any) =>
    navigate({ to: "/sales-orders/$soId", params: { soId: r.id } });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-2.5">
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => qc.invalidateQueries({ queryKey: ["sales-orders-list"] })}
          aria-label="Refresh"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
        <div className="flex h-9 flex-1 max-w-xl items-center gap-2 rounded-md border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in Sales Orders (  /  )"
            className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b bg-card px-5 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 text-lg font-semibold hover:text-primary">
              {view}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {VIEWS.map((v) => (
              <DropdownMenuItem key={v} onClick={() => setView(v)}>
                {v}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={openNew}
          >
            <Plus className="h-4 w-4" /> New
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => qc.invalidateQueries({ queryKey: ["sales-orders-list"] })}>
                Refresh List
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Import Sales Orders</DropdownMenuItem>
              <DropdownMenuItem disabled>Export Sales Orders</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b bg-card">
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-12 px-4 py-2.5 text-left">
                <div className="flex items-center gap-2">
                  <button className="text-muted-foreground hover:text-foreground" aria-label="Customize columns">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
                </div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Sales Order#</th>
              <th className="px-3 py-2.5 text-left font-medium">Customer Name</th>
              <th className="px-3 py-2.5 text-left font-medium">Order Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="w-10 px-3 py-2.5 text-right">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No sales orders found.</td></tr>
            ) : (
              filtered.map((r: any) => {
                const status = r.status as string;
                const display = (STATUS_DISPLAY[status] ?? status ?? "").toUpperCase().replace(/_/g, " ");
                const isSelected = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`group border-b transition-colors hover:bg-muted/40 ${isSelected ? "bg-muted/40" : ""}`}
                  >
                    <td className="px-4 py-3 align-middle">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(r.id)}
                        aria-label={`Select ${r.so_number}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle whitespace-nowrap">{formatDate(r.so_date)}</td>
                    <td className="px-3 py-3 align-middle">
                      <button
                        onClick={() => openRow(r)}
                        className="inline-flex items-center gap-1.5 font-medium text-sky-600 hover:underline"
                      >
                        {r.so_number}
                        {r.notes ? <Paperclip className="h-3 w-3 text-muted-foreground" /> : null}
                      </button>
                    </td>
                    <td className="px-3 py-3 align-middle font-medium">{r.customers?.name ?? "—"}</td>
                    <td className={`px-3 py-3 align-middle text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[status] ?? "text-muted-foreground"}`}>
                      {display}
                    </td>
                    <td className="px-3 py-3 align-middle text-right tabular-nums">
                      {formatCurrency(Number(r.total ?? 0), currency)}
                    </td>
                    <td className="px-3 py-3 align-middle text-right" />
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
