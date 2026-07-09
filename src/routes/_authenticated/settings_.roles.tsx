import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type RoleRow = {
  key: string;
  name: string;
  description: string;
  system: boolean;
  userCount: number;
};

const SYSTEM_ROLES: { key: string; name: string; description: string }[] = [
  { key: "super_admin", name: "Super Admin", description: "Full platform access across every workspace." },
  { key: "company_admin", name: "Admin", description: "Full access to this organization." },
  { key: "accountant", name: "Accountant", description: "Access to accounting, banking, taxes, and financial reports." },
  { key: "sales", name: "Sales", description: "Manage customers, quotes, sales orders, invoices, and payments." },
  { key: "purchasing", name: "Purchasing", description: "Manage vendors, purchase orders, bills, and payments." },
  { key: "inventory", name: "Inventory", description: "Manage items, warehouses, stock adjustments, and transfers." },
  { key: "readonly", name: "Read Only", description: "View-only access to records." },
];

const VIEWS = ["All Roles", "System Roles", "Custom Roles"] as const;

function SettingsRolesPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const [view, setView] = useState<(typeof VIEWS)[number]>("All Roles");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const { data: counts = {} } = useQuery({
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

  const { data: custom = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["custom-roles", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("custom_roles")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const allRoles: RoleRow[] = useMemo(() => {
    const sys = SYSTEM_ROLES.map((r) => ({
      ...r,
      system: true,
      userCount: (counts as any)[r.key] ?? 0,
    }));
    const cust = (custom as any[]).map((c) => ({
      key: c.id,
      name: c.name,
      description: c.description ?? "",
      system: false,
      userCount: (counts as any)[c.id] ?? 0,
    }));
    return [...sys, ...cust];
  }, [counts, custom]);

  const filtered = useMemo(() => {
    let list = allRoles.slice();
    if (view === "System Roles") list = list.filter((r) => r.system);
    if (view === "Custom Roles") list = list.filter((r) => !r.system);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    list.sort((a, b) => (sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
    return list;
  }, [allRoles, view, search, sortAsc]);

  const createRole = useMutation({
    mutationFn: async (v: { name: string; description: string; cloneFrom: string | null }) => {
      const { data, error } = await supabase.rpc("create_custom_role", {
        _name: v.name,
        _description: v.description || null,
        _clone_from: v.cloneFrom,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Role created");
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      setNewOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const updateRole = useMutation({
    mutationFn: async (v: { id: string; name: string; description: string }) => {
      const { error } = await supabase.rpc("update_custom_role", {
        _id: v.id,
        _name: v.name,
        _description: v.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_custom_role", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      setDeleting(null);
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
              <DropdownMenuItem key={v} onClick={() => setView(v)}>{v}</DropdownMenuItem>
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
            onClick={() => setNewOpen(true)}
          >
            <Plus className="h-4 w-4" /> New Role
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

        {!filtered.length ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">No roles match this view.</div>
        ) : (
          filtered.map((r, idx) => {
            const count = r.userCount;
            return (
              <div
                key={r.key}
                className={cn(
                  "grid grid-cols-[1fr_120px_140px_40px] items-center gap-4 border-b px-6 py-3",
                  idx % 2 === 1 && "bg-muted/20",
                )}
              >
                <Link
                  to="/settings/roles/$roleKey"
                  params={{ roleKey: r.key }}
                  className="flex items-start gap-3 hover:text-primary"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-primary">{r.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.description}</div>
                  </div>
                </Link>
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
                        r.system
                          ? toast.info("System roles can't be edited")
                          : setEditing({ id: r.key, name: r.name, description: r.description })
                      }
                      disabled={r.system}
                    >
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        createRole.mutate({
                          name: `${r.name} (copy)`,
                          description: r.description,
                          cloneFrom: r.key,
                        })
                      }
                    >
                      <Copy className="mr-2 h-4 w-4" /> Clone
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={r.system}
                      onClick={() =>
                        r.system
                          ? toast.info("System roles can't be deleted")
                          : setDeleting({ id: r.key, name: r.name })
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

      {/* New role */}
      <NewRoleDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        allRoles={allRoles}
        onCreate={(v) => createRole.mutate(v)}
        pending={createRole.isPending}
      />

      {/* Edit role */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              onClick={() => editing && updateRole.mutate(editing)}
              disabled={!editing?.name.trim() || updateRole.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete role */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Users currently assigned to this role will lose its permissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteRole.mutate(deleting.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewRoleDialog({
  open,
  onOpenChange,
  allRoles,
  onCreate,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allRoles: RoleRow[];
  onCreate: (v: { name: string; description: string; cloneFrom: string | null }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cloneFrom, setCloneFrom] = useState<string>("none");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>Create a custom role scoped to this workspace.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Clone permissions from</Label>
            <Select value={cloneFrom} onValueChange={setCloneFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Start empty</SelectItem>
                {allRoles.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            disabled={!name.trim() || pending}
            onClick={() =>
              onCreate({
                name: name.trim(),
                description: description.trim(),
                cloneFrom: cloneFrom === "none" ? null : cloneFrom,
              })
            }
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
