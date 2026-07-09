import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Plus,
  MoreHorizontal,
  Search,
  ArrowUpDown,
  ShieldCheck,
  Lock,
  Users as UsersIcon,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/roles")({
  head: () => ({ meta: [{ title: "Roles — Nimbus ERP" }] }),
  component: SettingsRolesPage,
});

type RoleDef = {
  key: string;
  name: string;
  description: string;
  system: boolean;
};

const SYSTEM_ROLES: RoleDef[] = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full platform access across every workspace. Cannot be edited or deleted.",
    system: true,
  },
  {
    key: "company_admin",
    name: "Admin",
    description: "Full access to this organization — settings, users, and all modules.",
    system: true,
  },
  {
    key: "accountant",
    name: "Accountant",
    description: "Access to accounting, banking, taxes, and financial reports.",
    system: true,
  },
  {
    key: "sales",
    name: "Sales",
    description: "Manage customers, quotes, sales orders, invoices, and payments received.",
    system: true,
  },
  {
    key: "purchasing",
    name: "Purchasing",
    description: "Manage vendors, purchase orders, bills, and payments made.",
    system: true,
  },
  {
    key: "inventory",
    name: "Inventory",
    description: "Manage items, warehouses, stock adjustments, and transfers.",
    system: true,
  },
  {
    key: "readonly",
    name: "Read Only",
    description: "View-only access to records. Cannot create, edit, or delete.",
    system: true,
  },
];

const VIEWS = ["All Roles", "System Roles", "Custom Roles"] as const;

function SettingsRolesPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const [view, setView] = useState<(typeof VIEWS)[number]>("All Roles");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  const { data: counts = {}, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["role-counts", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, tenant_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        const row = r as any;
        if (row.tenant_id && row.tenant_id !== tenantId && row.role !== "super_admin") continue;
        map[row.role as string] = (map[row.role as string] ?? 0) + 1;
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    let list = SYSTEM_ROLES.slice();
    if (view === "System Roles") list = list.filter((r) => r.system);
    if (view === "Custom Roles") list = list.filter((r) => !r.system);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => (sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
    return list;
  }, [view, search, sortAsc]);

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-background">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-6 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-1.5 text-lg font-semibold">
              {view} <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {VIEWS.map((v) => (
              <DropdownMenuItem key={v} onClick={() => setView(v)}>
                {v}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative ml-2 hidden md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles"
            className="h-8 w-64 pl-8 text-sm"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => toast.info("Custom roles — coming soon")}
          >
            <Plus className="h-4 w-4" /> New Role
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card">
        <div className="grid grid-cols-[1fr_120px_140px_40px] items-center gap-4 border-b bg-muted/40 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <button
            className="flex items-center gap-1.5 text-left hover:text-foreground"
            onClick={() => setSortAsc((s) => !s)}
          >
            Role <ArrowUpDown className="h-3 w-3" />
          </button>
          <div>Type</div>
          <div>Users Assigned</div>
          <div />
        </div>

        {isLoading ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">Loading roles…</div>
        ) : !filtered.length ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">No roles match this view.</div>
        ) : (
          filtered.map((r, idx) => {
            const count = counts[r.key] ?? 0;
            return (
              <div
                key={r.key}
                className={cn(
                  "grid grid-cols-[1fr_120px_140px_40px] items-center gap-4 border-b px-6 py-3",
                  idx % 2 === 1 && "bg-muted/20",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-primary">{r.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.description}</div>
                  </div>
                </div>
                <div>
                  {r.system ? (
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <Lock className="h-3 w-3" /> System
                    </Badge>
                  ) : (
                    <Badge className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50">
                      Custom
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-foreground/80">
                  <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {count} {count === 1 ? "user" : "users"}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        toast.info(r.system ? "System roles can't be edited" : "Edit role — coming soon")
                      }
                      disabled={r.system}
                    >
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.info("Duplicate role — coming soon")}>
                      <Copy className="mr-2 h-4 w-4" /> Clone
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={r.system}
                      onClick={() =>
                        toast.info(r.system ? "System roles can't be deleted" : "Delete role — coming soon")
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
