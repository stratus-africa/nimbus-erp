import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { TxDialog, type DocConfig } from "@/components/transactions-module";
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

const STATUS_STYLES: Record<string, string> = {
  draft: "text-muted-foreground",
  sent: "text-sky-600",
  open: "text-sky-600",
  approved: "text-sky-600",
  accepted: "text-emerald-600",
  paid: "text-emerald-600",
  received: "text-emerald-600",
  converted: "text-emerald-600",
  partially_paid: "text-amber-600",
  partially_received: "text-amber-600",
  rejected: "text-rose-600",
  cancelled: "text-rose-600",
  overdue: "text-rose-600",
  expired: "text-amber-600",
  closed: "text-muted-foreground",
};

const STATUS_DISPLAY: Record<string, string> = {
  converted: "INVOICED",
  partially_paid: "PARTIALLY PAID",
  partially_received: "PARTIALLY RECEIVED",
};

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type TransactionsListingProps = {
  config: DocConfig;
  views?: string[];
  numberLabel: string;
  /** Optional row click handler. If omitted, opens the edit dialog. */
  onRowClick?: (row: any) => void;
  /** Optional new handler. If omitted, opens the new dialog. */
  onNew?: () => void;
  /** Right-side header extra. */
  headerExtra?: ReactNode;
};

export function TransactionsListing({
  config,
  views,
  numberLabel,
  onRowClick,
  onNew,
  headerExtra,
}: TransactionsListingProps) {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const qc = useQueryClient();
  const navigate = useNavigate();
  void navigate;

  const VIEWS = useMemo(
    () => views ?? ["All", ...config.statuses.map((s) => s.label)],
    [views, config.statuses],
  );

  const [view, setView] = useState<string>(VIEWS[0]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const queryKey = [`${config.docTable}-list`, tenantId] as const;

  const { data: rows, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey,
    queryFn: async () => {
      const partyJoin =
        config.partyTable === "customers" ? "customers(name)" : "suppliers(name)";
      const { data, error } = await supabase
        .from(config.docTable)
        .select(`*, ${partyJoin}`)
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order(config.dateField, { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = (rows ?? []) as any[];
    if (view !== VIEWS[0]) {
      const status = config.statuses.find((s) => s.label === view)?.value;
      if (status) list = list.filter((r) => r.status === status);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r[config.numberField] as string | undefined)?.toLowerCase().includes(q) ||
          r[config.partyTable]?.name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, view, search, VIEWS, config]);

  const allChecked =
    filtered.length > 0 && filtered.every((r: any) => selected.has(r.id));
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

  const handleNew = () => {
    if (onNew) onNew();
    else {
      setEditing(null);
      setDialogOpen(true);
    }
  };

  const handleRow = (r: any) => {
    if (onRowClick) onRowClick(r);
    else {
      setEditing(r);
      setDialogOpen(true);
    }
  };

  const partyLabel = `${config.partyLabel} Name`;
  const refreshKey = queryKey[0];

  return (
    <div className="-m-6 flex h-full flex-col bg-background">
      {/* Top utility bar */}
      <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-2.5">
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => qc.invalidateQueries({ queryKey: [refreshKey] })}
          aria-label="Refresh"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
        <div className="flex h-9 flex-1 max-w-xl items-center gap-2 rounded-md border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <button className="text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search in ${config.title} (  /  )`}
            className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        {headerExtra}
      </div>

      {/* Header row: view selector + actions */}
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
            onClick={handleNew}
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
              <DropdownMenuItem
                onClick={() => qc.invalidateQueries({ queryKey: [refreshKey] })}
              >
                Refresh List
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Import {config.title}</DropdownMenuItem>
              <DropdownMenuItem disabled>Export {config.title}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b bg-card">
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-12 px-4 py-2.5 text-left">
                <div className="flex items-center gap-2">
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Customize columns"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Location</th>
              <th className="px-3 py-2.5 text-left font-medium">{numberLabel}</th>
              <th className="px-3 py-2.5 text-left font-medium">Reference Number</th>
              <th className="px-3 py-2.5 text-left font-medium">{partyLabel}</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="w-10 px-3 py-2.5 text-right">
                <Search className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No {config.title.toLowerCase()} found.
                </td>
              </tr>
            ) : (
              filtered.map((r: any) => {
                const status = r.status as string;
                const display = (
                  STATUS_DISPLAY[status] ??
                  (status ? titleCase(status) : "—")
                ).toUpperCase();
                const isSelected = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`group border-b transition-colors hover:bg-muted/40 ${
                      isSelected ? "bg-muted/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3 align-middle">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(r.id)}
                        aria-label={`Select ${r[config.numberField]}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle whitespace-nowrap">
                      {formatDate(r[config.dateField])}
                    </td>
                    <td className="px-3 py-3 align-middle">Head Office</td>
                    <td className="px-3 py-3 align-middle">
                      <button
                        onClick={() => handleRow(r)}
                        className="inline-flex items-center gap-1.5 font-medium text-sky-600 hover:underline"
                      >
                        {r[config.numberField]}
                        {r.notes ? (
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                        ) : null}
                      </button>
                    </td>
                    <td className="px-3 py-3 align-middle text-muted-foreground">
                      {r.reference ?? "—"}
                    </td>
                    <td className="px-3 py-3 align-middle font-medium">
                      {r[config.partyTable]?.name ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-3 align-middle text-xs font-semibold uppercase tracking-wide ${
                        STATUS_STYLES[status] ?? "text-muted-foreground"
                      }`}
                    >
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

      {tenantId && (
        <TxDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
          config={config}
          tenantId={tenantId}
          currency={currency}
          onSaved={() => qc.invalidateQueries({ queryKey: [refreshKey] })}
        />
      )}
    </div>
  );
}
