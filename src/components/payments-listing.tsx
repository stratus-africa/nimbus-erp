import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/format";
import { ChevronDown, MoreHorizontal, Plus, RefreshCcw, Search } from "lucide-react";

export type PaymentsKind = "received" | "made";

export type PaymentsModuleConfig = {
  kind: PaymentsKind;
  /** Page title e.g. "Payments Received" */
  title: string;
  /** "invoice_payments" or "bill_payments" */
  table: "invoice_payments" | "bill_payments";
  /** Foreign key column to invoice/bill */
  docFk: "invoice_id" | "bill_id";
  /** Parent doc table */
  docTable: "invoices" | "bills";
  /** Display number column */
  docNumberField: "invoice_number" | "bill_number";
  /** Party table */
  partyTable: "customers" | "suppliers";
  /** Party label e.g. "Customer" */
  partyLabel: string;
  /** Route to the new-payment page */
  newRoute: "/payments-received/new" | "/payments-made/new";
};

export function PaymentsListing({
  config,
  unallocated = false,
  partyId,
}: {
  config: PaymentsModuleConfig;
  unallocated?: boolean;
  partyId?: string;
}) {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const creditsTable = config.partyTable === "customers" ? "customer_credits" : "supplier_credits";
  const partyFk = config.partyTable === "customers" ? "customer_id" : "supplier_id";

  const queryKey = [
    unallocated ? creditsTable : config.table,
    "list",
    tenantId,
    unallocated ? "unallocated" : "all",
    partyId ?? "",
  ] as const;

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey,
    queryFn: async () => {
      if (unallocated) {
        const partyJoin =
          config.partyTable === "customers" ? "customers(name)" : "suppliers(name)";
        let q = supabase
          .from(creditsTable)
          .select(`*, ${partyJoin}`)
          .eq("tenant_id", tenantId!)
          .gt("balance", 0)
          .is("deleted_at", null)
          .order("issue_date", { ascending: false });
        if (partyId) q = (q as any).eq(partyFk, partyId);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
      }
      const partyJoin =
        config.partyTable === "customers" ? "customers(name)" : "suppliers(name)";
      const docJoin =
        config.docTable === "invoices"
          ? `invoices(${config.docNumberField}, customer_id, ${partyJoin})`
          : `bills(${config.docNumberField}, supplier_id, ${partyJoin})`;
      const { data, error } = await supabase
        .from(config.table)
        .select(`*, ${docJoin}`)
        .eq("tenant_id", tenantId!)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = (rows ?? []) as any[];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      if (unallocated) {
        const party = r[config.partyTable];
        return (
          party?.name?.toLowerCase().includes(q) ||
          r.reference?.toLowerCase().includes(q) ||
          r.credit_number?.toLowerCase().includes(q)
        );
      }
      const doc = r[config.docTable];
      const party = doc?.[config.partyTable];
      return (
        doc?.[config.docNumberField]?.toLowerCase().includes(q) ||
        party?.name?.toLowerCase().includes(q) ||
        r.reference?.toLowerCase().includes(q) ||
        r.method?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, config]);

  return (
    <div className="-m-6 flex h-full flex-col bg-background">
      {/* utility bar */}
      <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-2.5">
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => qc.invalidateQueries({ queryKey: [queryKey[0]] })}
          aria-label="Refresh"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
        <div className="flex h-9 flex-1 max-w-xl items-center gap-2 rounded-md border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${config.title}`}
            className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{config.title}</h1>
          {unallocated && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Unused credits only
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unallocated && (
            <Button
              variant="outline" size="sm" className="h-8"
              onClick={() => navigate({ to: config.newRoute.replace("/new", "") as any })}
            >
              Show all payments
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => navigate({ to: config.newRoute })}
          >
            <Plus className="h-4 w-4" /> Record Payment
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => qc.invalidateQueries({ queryKey: [queryKey[0]] })}
              >
                Refresh List
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b bg-card">
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">{config.partyLabel}</th>
              <th className="px-3 py-2.5 text-left font-medium">
                {unallocated ? "Credit #" : config.docTable === "invoices" ? "Invoice #" : "Bill #"}
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Reference</th>
              <th className="px-3 py-2.5 text-left font-medium">
                {unallocated ? "Source" : "Method"}
              </th>
              <th className="px-3 py-2.5 text-right font-medium">
                {unallocated ? "Balance" : "Amount"}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {unallocated ? "No unused credits." : "No payments recorded yet."}
                </td>
              </tr>
            ) : unallocated ? (
              filtered.map((r: any) => {
                const party = r[config.partyTable];
                return (
                  <tr key={r.id} className="border-b transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 align-middle whitespace-nowrap">{formatDate(r.issue_date)}</td>
                    <td className="px-3 py-3 align-middle font-medium">{party?.name ?? "—"}</td>
                    <td className="px-3 py-3 align-middle">{r.credit_number ?? "—"}</td>
                    <td className="px-3 py-3 align-middle text-muted-foreground">{r.reference ?? "—"}</td>
                    <td className="px-3 py-3 align-middle capitalize">{r.source ?? "—"}</td>
                    <td className="px-3 py-3 align-middle text-right tabular-nums font-medium text-amber-700">
                      {formatCurrency(Number(r.balance ?? 0), currency)}
                    </td>
                  </tr>
                );
              })
            ) : (
              filtered.map((r: any) => {
                const doc = r[config.docTable];
                const party = doc?.[config.partyTable];
                return (
                  <tr key={r.id} className="border-b transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 align-middle whitespace-nowrap">{formatDate(r.payment_date)}</td>
                    <td className="px-3 py-3 align-middle font-medium">{party?.name ?? "—"}</td>
                    <td className="px-3 py-3 align-middle">{doc?.[config.docNumberField] ?? "—"}</td>
                    <td className="px-3 py-3 align-middle text-muted-foreground">{r.reference ?? "—"}</td>
                    <td className="px-3 py-3 align-middle capitalize">{r.method ?? "—"}</td>
                    <td className="px-3 py-3 align-middle text-right tabular-nums font-medium">
                      {formatCurrency(Number(r.amount ?? 0), currency)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {/* hint */}
      <div className="border-t bg-muted/20 px-5 py-2 text-xs text-muted-foreground">
        <Link to={config.docTable === "invoices" ? "/invoices" : "/bills"} className="text-primary hover:underline">
          Go to {config.docTable === "invoices" ? "Invoices" : "Bills"}
        </Link>{" "}
        to view balances.
        <ChevronDown className="ml-1 inline h-3 w-3" />
      </div>
    </div>
  );
}
