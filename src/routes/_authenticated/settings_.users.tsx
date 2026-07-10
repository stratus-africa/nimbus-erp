import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { inviteUser, createUser } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronDown,
  PlayCircle,
  Plus,
  UserPlus,
  MoreHorizontal,
  Search,
  ArrowUpDown,
  ShieldCheck,
  UserCheck,
  UserX,
  ScrollText,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/settings_/users")({
  head: () => ({ meta: [{ title: "Users — Nimbus ERP" }] }),
  component: () => (
    <PermissionGate module="users">
      <SettingsUsersPage />
    </PermissionGate>
  ),
});

type Member = {
  user_id: string;
  joined_at: string | null;
  status: string;
  profile: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  roles: string[];
};

const VIEWS = ["All Users", "Active Users", "Admins", "Suspended Users"] as const;

const ENUM_ROLES: { value: string; label: string }[] = [
  { value: "company_admin", label: "Admin" },
  { value: "accountant", label: "Accountant" },
  { value: "sales", label: "Sales" },
  { value: "purchasing", label: "Purchasing" },
  { value: "inventory", label: "Inventory" },
  { value: "readonly", label: "Read Only" },
];

function SettingsUsersPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const [view, setView] = useState<(typeof VIEWS)[number]>("All Users");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [auditFor, setAuditFor] = useState<Member | null>(null);
  const [warehouseFor, setWarehouseFor] = useState<Member | null>(null);
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["tenant-members", tenantId],
    queryFn: async () => {
      const { data: tm, error } = await (supabase as any)
        .from("tenant_members")
        .select("user_id, joined_at, status, profiles:user_id(full_name, email, avatar_url)")
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
          const row = r as any;
          if (row.tenant_id && row.tenant_id !== tenantId && row.role !== "super_admin") continue;
          const uid = row.user_id as string;
          (roleMap[uid] ||= []).push(row.role as string);
        }
      }
      return (tm ?? []).map((m: any) => ({
        user_id: m.user_id,
        joined_at: m.joined_at,
        status: m.status ?? "active",
        profile: m.profiles,
        roles: roleMap[m.user_id] ?? [],
      })) as Member[];
    },
  });

  const { data: customRoles = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["custom-roles", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("custom_roles")
        .select("id, name")
        .eq("tenant_id", tenantId!);
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = members.slice();
    if (view === "Admins") {
      list = list.filter((m) => m.roles.some((r) => r === "company_admin" || r === "super_admin"));
    }
    if (view === "Active Users") list = list.filter((m) => m.status === "active");
    if (view === "Suspended Users") list = list.filter((m) => m.status === "suspended");
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
    const enumMatch = ENUM_ROLES.find((r) => roles.includes(r.value));
    if (enumMatch) return enumMatch.label;
    const custom = (customRoles as any[]).find((c) => roles.includes(c.id));
    if (custom) return custom.name;
    return roles[0];
  };

  const initials = (m: Member) => {
    const name = m.profile?.full_name ?? m.profile?.email ?? "?";
    return name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  };

  // ---- Mutations ----
  const invoke = useServerFn(inviteUser);
  const invokeCreate = useServerFn(createUser);

  const invite = useMutation({
    mutationFn: (v: { email: string; role: string }) =>
      invoke({ data: { ...v, redirectTo: `${window.location.origin}/auth` } }),
    onSuccess: (r) => {
      toast.success(r.alreadyRegistered ? "User added to workspace" : "Invitation email sent");
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
      setInviteOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to invite user"),
  });

  const createUserMut = useMutation({
    mutationFn: (v: { email: string; password: string; fullName?: string; role: string }) =>
      invokeCreate({ data: v }),
    onSuccess: () => {
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
      setCreateOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create user"),
  });

  const setStatus = useMutation({
    mutationFn: async (v: { userId: string; status: "active" | "suspended" }) => {
      const { error } = await supabase.rpc("set_user_status", {
        _user: v.userId,
        _tenant: tenantId!,
        _status: v.status,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "suspended" ? "User suspended" : "User activated");
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const assignRole = useMutation({
    mutationFn: async (v: { userId: string; role: string }) => {
      const { error } = await supabase.rpc("assign_user_role", {
        _user: v.userId,
        _tenant: tenantId!,
        _role: v.role as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Plus className="h-4 w-4" /> Add User <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Invite User
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card">
        <div className="grid grid-cols-[1fr_260px_160px_60px] items-center gap-4 border-b bg-muted/40 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <button
            className="flex items-center gap-1.5 text-left hover:text-foreground"
            onClick={() => setSortAsc((s) => !s)}
          >
            User Details <ArrowUpDown className="h-3 w-3" />
          </button>
          <div>Role</div>
          <div>Status</div>
          <div />
        </div>

        {isLoading ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">Loading users…</div>
        ) : !filtered.length ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">No users match this view.</div>
        ) : (
          filtered.map((m, idx) => {
            const suspended = m.status === "suspended";
            return (
              <div
                key={m.user_id}
                className={cn(
                  "grid grid-cols-[1fr_260px_160px_60px] items-center gap-4 border-b px-6 py-3",
                  idx % 2 === 1 && "bg-muted/20",
                )}
              >
                <div className="flex items-center gap-3">
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
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
                  {suspended ? (
                    <Badge className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
                      Suspended
                    </Badge>
                  ) : (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                      Active
                    </Badge>
                  )}
                </div>
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <ShieldCheck className="mr-2 h-4 w-4" /> Change role
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {ENUM_ROLES.map((r) => (
                            <DropdownMenuItem
                              key={r.value}
                              onClick={() => assignRole.mutate({ userId: m.user_id, role: r.value })}
                            >
                              {r.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      {suspended ? (
                        <DropdownMenuItem
                          onClick={() => setStatus.mutate({ userId: m.user_id, status: "active" })}
                        >
                          <UserCheck className="mr-2 h-4 w-4 text-emerald-600" /> Activate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => setStatus.mutate({ userId: m.user_id, status: "suspended" })}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserX className="mr-2 h-4 w-4" /> Suspend
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setWarehouseFor(m)}>
                        <Warehouse className="mr-2 h-4 w-4" /> Manage Warehouses
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAuditFor(m)}>
                        <ScrollText className="mr-2 h-4 w-4" /> View timeline
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
        )}
      </div>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={(v) => invite.mutate(v)}
        pending={invite.isPending}
        tenantName={profile?.currentTenant?.name ?? ""}
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(v) => createUserMut.mutate(v)}
        pending={createUserMut.isPending}
        tenantName={profile?.currentTenant?.name ?? ""}
      />

      <AuditDrawer member={auditFor} tenantId={tenantId} onClose={() => setAuditFor(null)} />
      <WarehousesDialog member={warehouseFor} tenantId={tenantId} onClose={() => setWarehouseFor(null)} />
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
  tenantName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: { email: string; role: string }) => void;
  pending: boolean;
  tenantName: string;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("readonly");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            Send a signup invitation. They'll join <span className="font-medium">{tenantName}</span> once
            they accept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address *</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENUM_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <UserPlus className="h-3.5 w-3.5" /> Workspace
            </div>
            <div className="mt-1">{tenantName}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            disabled={!email.trim() || pending}
            onClick={() => onSubmit({ email: email.trim(), role })}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {pending ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditDrawer({
  member,
  tenantId,
  onClose,
}: {
  member: Member | null;
  tenantId?: string;
  onClose: () => void;
}) {
  const { data = [] } = useQuery({
    enabled: !!member && !!tenantId,
    queryKey: ["member-audit", tenantId, member?.user_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("entity_type", "tenant_members")
        .eq("entity_id", member!.user_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={!!member} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Activity — {member?.profile?.full_name ?? member?.profile?.email}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-auto">
          {data.length === 0 ? (
            <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No activity yet.
            </div>
          ) : (
            data.map((e: any) => (
              <div key={e.id} className="rounded-md border p-3">
                <div className="text-sm">{e.summary}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {e.actor_name} · {formatDate(e.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WarehousesDialog({
  member,
  tenantId,
  onClose,
}: {
  member: Member | null;
  tenantId: string | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: warehouses = [] } = useQuery({
    enabled: !!tenantId && !!member,
    queryKey: ["tenant-warehouses", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("locations")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
  });

  const { data: assigned } = useQuery({
    enabled: !!tenantId && !!member,
    queryKey: ["member-warehouses", tenantId, member?.user_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_warehouses")
        .select("warehouse_id")
        .eq("tenant_id", tenantId!)
        .eq("user_id", member!.user_id);
      return (data ?? []).map((r: any) => r.warehouse_id as string);
    },
  });

  useEffect(() => {
    if (assigned) setSelected(new Set(assigned));
  }, [assigned]);

  const save = useMutation({
    mutationFn: async () => {
      const { error: delErr } = await (supabase as any)
        .from("user_warehouses")
        .delete()
        .eq("tenant_id", tenantId!)
        .eq("user_id", member!.user_id);
      if (delErr) throw delErr;
      const rows = Array.from(selected).map((wid) => ({
        tenant_id: tenantId!,
        user_id: member!.user_id,
        warehouse_id: wid,
      }));
      if (rows.length) {
        const { error } = await (supabase as any).from("user_warehouses").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Warehouse access updated");
      qc.invalidateQueries({ queryKey: ["member-warehouses"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Warehouses</DialogTitle>
          <DialogDescription>
            {member?.profile?.full_name ?? member?.profile?.email ?? "User"}. Leave all unchecked to grant access to every warehouse.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-auto">
          {warehouses.map((w: any) => (
            <label key={w.id} className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-muted/30">
              <input
                type="checkbox"
                checked={selected.has(w.id)}
                onChange={() => toggle(w.id)}
              />
              <span className="text-sm">{w.name}</span>
            </label>
          ))}
          {warehouses.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No warehouses configured.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
