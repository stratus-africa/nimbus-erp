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
import { ChevronDown, PlayCircle, Plus, UserPlus, MoreHorizontal, Search, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/users")({
  head: () => ({ meta: [{ title: "Users — Nimbus ERP" }] }),
  component: SettingsUsersPage,
});

type Member = {
  user_id: string;
  joined_at: string | null;
  profile: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  roles: string[];
};

const VIEWS = ["All Users", "Active Users", "Admins", "Inactive Users"] as const;

function SettingsUsersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const [view, setView] = useState<(typeof VIEWS)[number]>("All Users");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  const { data: members = [], isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["tenant-members", tenantId],
    queryFn: async () => {
      const { data: tm, error } = await (supabase as any)
        .from("tenant_members")
        .select("user_id, joined_at, profiles:user_id(full_name, email, avatar_url)")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      const userIds = (tm ?? []).map((m: any) => m.user_id);
      let roleMap: Record<string, string[]> = {};
      if (userIds.length) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role, tenant_id")
          .in("user_id", userIds);
        for (const r of roles ?? []) {
          if ((r as any).tenant_id && (r as any).tenant_id !== tenantId && (r as any).role !== "super_admin") continue;
          const uid = (r as any).user_id as string;
          (roleMap[uid] ||= []).push((r as any).role as string);
        }
      }
      return (tm ?? []).map((m: any) => ({
        user_id: m.user_id,
        joined_at: m.joined_at,
        profile: m.profiles,
        roles: roleMap[m.user_id] ?? [],
      })) as Member[];
    },
  });

  const filtered = useMemo(() => {
    let list = members.slice();
    if (view === "Admins") {
      list = list.filter((m) => m.roles.some((r) => r === "company_admin" || r === "super_admin"));
    }
    // No inactive/active concept yet — all listed members are active
    if (view === "Inactive Users") list = [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.profile?.full_name?.toLowerCase().includes(q) ||
          m.profile?.email?.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      const an = (a.profile?.full_name ?? a.profile?.email ?? "").toLowerCase();
      const bn = (b.profile?.full_name ?? b.profile?.email ?? "").toLowerCase();
      return sortAsc ? an.localeCompare(bn) : bn.localeCompare(an);
    });
    return list;
  }, [members, view, search, sortAsc]);

  const roleLabel = (roles: string[]) => {
    if (roles.includes("super_admin")) return "Super Admin";
    if (roles.includes("company_admin")) return "Admin";
    if (!roles.length) return "Member";
    return roles[0]
      .split("_")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(" ");
  };

  const initials = (m: Member) => {
    const name = m.profile?.full_name ?? m.profile?.email ?? "?";
    return name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

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
            placeholder="Search users"
            className="h-8 w-64 pl-8 text-sm"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-primary">
            <PlayCircle className="h-4 w-4" /> How to add users
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => toast.info("Invite Accountant — coming soon")}
          >
            <UserPlus className="h-4 w-4" /> Invite Accountant
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => toast.info("Invite User — coming soon")}
          >
            <Plus className="h-4 w-4" /> Invite User
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card">
        <div className="grid grid-cols-[1fr_240px_160px] items-center gap-4 border-b bg-muted/40 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <button
            className="flex items-center gap-1.5 text-left hover:text-foreground"
            onClick={() => setSortAsc((s) => !s)}
          >
            User Details <ArrowUpDown className="h-3 w-3" />
          </button>
          <div>Role</div>
          <div>Status</div>
        </div>

        {isLoading ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">Loading users…</div>
        ) : !filtered.length ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">No users match this view.</div>
        ) : (
          filtered.map((m, idx) => (
            <div
              key={m.user_id}
              className={cn(
                "grid grid-cols-[1fr_240px_160px] items-center gap-4 border-b px-6 py-3",
                idx % 2 === 1 && "bg-muted/20",
              )}
            >
              <div className="flex items-center gap-3">
                {m.profile?.avatar_url ? (
                  <img
                    src={m.profile.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                    {initials(m)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-primary">
                    {m.profile?.full_name ?? m.profile?.email ?? "Unnamed user"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.profile?.email ?? "—"}
                  </div>
                </div>
              </div>
              <div className="text-sm">
                <span className={cn(roleLabel(m.roles) !== "Member" && "uppercase text-xs font-medium tracking-wide")}>
                  {roleLabel(m.roles)}
                </span>
              </div>
              <div>
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  Active
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
