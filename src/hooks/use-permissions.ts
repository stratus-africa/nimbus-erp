import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";

export const MODULES = [
  "items",
  "invoices",
  "sales_orders",
  "purchase_orders",
  "bills",
  "quotes",
  "transfer_orders",
  "warehouses",
  "expenses",
  "customers",
  "suppliers",
  "banking",
  "chart_of_accounts",
  "reports",
  "users",
  "roles",
  "settings",
] as const;
export type Module = (typeof MODULES)[number];

export const MODULE_LABELS: Record<Module, string> = {
  items: "Items",
  invoices: "Invoices",
  sales_orders: "Sales Orders",
  purchase_orders: "Purchase Orders",
  bills: "Bills",
  quotes: "Quotes",
  transfer_orders: "Transfer Orders",
  warehouses: "Warehouses",
  expenses: "Expenses",
  customers: "Customers",
  suppliers: "Suppliers",
  banking: "Banking",
  chart_of_accounts: "Chart of Accounts",
  reports: "Reports",
  users: "Users",
  roles: "Roles",
  settings: "Settings",
};

export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export"] as const;
export type PermAction = (typeof ACTIONS)[number];

export const ACTION_COLUMNS: Record<PermAction, keyof PermRow> = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
  approve: "can_approve",
  export: "can_export",
};

export type PermRow = {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
};

/**
 * Returns a permission checker `can(module, action)` for the current user in
 * their current tenant. company_admin / super_admin get true for everything.
 */
export function usePermissions() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const userId = profile?.user?.id;
  const isSuper = profile?.isSuperAdmin;
  const isAdmin = (profile?.roles ?? []).some(
    (r: any) => r.role === "company_admin" && r.tenant_id === tenantId,
  );

  const roleKeys = (profile?.roles ?? [])
    .filter((r: any) => r.tenant_id === tenantId || r.role === "super_admin")
    .map((r: any) => r.role as string);

  const query = useQuery({
    enabled: !!tenantId && !!userId && !isSuper && !isAdmin && roleKeys.length > 0,
    queryKey: ["role-permissions", tenantId, roleKeys.slice().sort().join(",")],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .in("role_key", roleKeys);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  const can = (module: Module, action: PermAction): boolean => {
    if (isSuper || isAdmin) return true;
    if (!query.data) return false;
    const col = ACTION_COLUMNS[action];
    return query.data.some((r) => r.module === module && (r as any)[col] === true);
  };

  return { can, ready: !!profile && (isSuper || isAdmin || !query.isLoading) };
}
