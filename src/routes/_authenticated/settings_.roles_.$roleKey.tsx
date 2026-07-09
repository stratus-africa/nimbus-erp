import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Lock, ShieldCheck, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { MODULES, MODULE_LABELS, ACTIONS, ACTION_COLUMNS, type PermRow } from "@/hooks/use-permissions";

import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/settings_/roles_/$roleKey")({
  head: () => ({ meta: [{ title: "Role Permissions — Nimbus ERP" }] }),
  component: () => (
    <PermissionGate module="roles">
      <RoleDetailPage />
    </PermissionGate>
  ),
});

const SYSTEM_ROLE_INFO: Record<string, { name: string; description: string }> = {
  super_admin: { name: "Super Admin", description: "Full platform access across every workspace." },
  company_admin: { name: "Admin", description: "Full access to this organization." },
  accountant: { name: "Accountant", description: "Access to accounting, banking, taxes, and financial reports." },
  sales: { name: "Sales", description: "Manage customers, quotes, sales orders, invoices, and payments." },
  purchasing: { name: "Purchasing", description: "Manage vendors, purchase orders, bills, and payments." },
  inventory: { name: "Inventory", description: "Manage items, warehouses, and transfers." },
  readonly: { name: "Read Only", description: "View-only access." },
};

const ACTION_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  export: "Export",
};

function RoleDetailPage() {
  const { roleKey } = Route.useParams();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isSystem = !!SYSTEM_ROLE_INFO[roleKey];
  const cannotEdit = roleKey === "super_admin" || roleKey === "company_admin";

  const { data: customInfo } = useQuery({
    enabled: !!tenantId && !isSystem,
    queryKey: ["custom-role", tenantId, roleKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("custom_roles")
        .select("*")
        .eq("id", roleKey)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["role-permissions", tenantId, roleKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("role_key", roleKey);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  // Local grid state, keyed by module
  const [grid, setGrid] = useState<Record<string, PermRow>>({});
  useEffect(() => {
    const next: Record<string, PermRow> = {};
    for (const m of MODULES) {
      const found = rows.find((r) => r.module === m);
      next[m] = found ?? {
        module: m,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_approve: false,
        can_export: false,
      };
    }
    setGrid(next);
  }, [rows]);

  const info = isSystem ? SYSTEM_ROLE_INFO[roleKey] : { name: customInfo?.name ?? "Role", description: customInfo?.description ?? "" };

  const save = useMutation({
    mutationFn: async () => {
      const payload = MODULES.map((m) => grid[m]).filter(Boolean);
      const { error } = await (supabase.rpc as any)("save_role_permissions", {
        _role_key: roleKey,
        _rows: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissions saved");
      qc.invalidateQueries({ queryKey: ["role-permissions", tenantId, roleKey] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const toggle = (mod: string, action: (typeof ACTIONS)[number]) => {
    if (cannotEdit) return;
    const col = ACTION_COLUMNS[action];
    setGrid((g) => ({
      ...g,
      [mod]: { ...g[mod], [col]: !(g[mod] as any)[col] },
    }));
  };

  const toggleModuleAll = (mod: string) => {
    if (cannotEdit) return;
    const current = grid[mod];
    const anyOff = ACTIONS.some((a) => !(current as any)[ACTION_COLUMNS[a]]);
    const target = anyOff;
    setGrid((g) => ({
      ...g,
      [mod]: {
        ...g[mod],
        can_view: target, can_create: target, can_edit: target,
        can_delete: target, can_approve: target, can_export: target,
      },
    }));
  };

  const { data: audit = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["role-audit", tenantId, roleKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("entity_type", "roles")
        .or(`entity_id.eq.${isSystem ? "00000000-0000-0000-0000-000000000000" : roleKey},details->>role_key.eq.${roleKey}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/settings/roles" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-violet-100 text-violet-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              {info.name}
              {isSystem ? (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Lock className="h-3 w-3" /> System
                </Badge>
              ) : (
                <Badge className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50">Custom</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{info.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/settings/roles">Back</Link>
          </Button>
          <Button
            disabled={cannotEdit || save.isPending || isLoading}
            onClick={() => save.mutate()}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {save.isPending ? "Saving…" : "Save permissions"}
          </Button>
        </div>
      </div>

      {cannotEdit && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {roleKey === "super_admin"
            ? "Super Admin always has full access — permissions are not editable."
            : "Admin always has full access — permissions are not editable."}
        </div>
      )}

      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="timeline">
            <ScrollText className="mr-1.5 h-3.5 w-3.5" /> Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="mt-4">
          <div className="overflow-hidden rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Module</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="px-3 py-2.5 text-center font-semibold">{ACTION_LABELS[a]}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold">All</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m, idx) => {
                  const row = grid[m];
                  if (!row) return null;
                  return (
                    <tr key={m} className={idx % 2 === 1 ? "bg-muted/20" : ""}>
                      <td className="px-4 py-2.5 font-medium">{MODULE_LABELS[m]}</td>
                      {ACTIONS.map((a) => (
                        <td key={a} className="px-3 py-2.5 text-center">
                          <Checkbox
                            disabled={cannotEdit}
                            checked={(row as any)[ACTION_COLUMNS[a]]}
                            onCheckedChange={() => toggle(m, a)}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => toggleModuleAll(m)}
                          disabled={cannotEdit}
                        >
                          Toggle
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <div className="rounded-md border bg-card p-4">
            {audit.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No activity yet.</div>
            ) : (
              <ul className="space-y-3">
                {audit.map((e: any) => (
                  <li key={e.id} className="rounded-md border p-3">
                    <div className="text-sm">{e.summary}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {e.actor_name} · {formatDate(e.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
