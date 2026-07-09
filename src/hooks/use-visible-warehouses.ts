import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";

/**
 * Returns the set of warehouse IDs the current user is allowed to see for
 * the active tenant. If null, the user has NO restriction (see all).
 * Company admins and super admins always get null (unrestricted).
 */
export function useVisibleWarehouseIds(): { ids: string[] | null; ready: boolean } {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const userId = profile?.user?.id;
  const isSuper = profile?.isSuperAdmin;
  const isAdmin = (profile?.roles ?? []).some(
    (r: any) => r.role === "company_admin" && r.tenant_id === tenantId,
  );

  const q = useQuery({
    enabled: !!tenantId && !!userId && !isSuper && !isAdmin,
    queryKey: ["user-warehouses", tenantId, userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_warehouses")
        .select("warehouse_id")
        .eq("tenant_id", tenantId!)
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.warehouse_id as string);
    },
  });

  if (isSuper || isAdmin) return { ids: null, ready: true };
  if (!tenantId || !userId) return { ids: null, ready: false };
  if (q.isLoading) return { ids: null, ready: false };
  const ids = q.data ?? [];
  // No restrictions configured = unrestricted
  return { ids: ids.length === 0 ? null : ids, ready: true };
}

/**
 * Returns item IDs that have stock in any of the given warehouse IDs.
 * Used to filter product pickers when a user is warehouse-scoped.
 */
export function useItemIdsInWarehouses(warehouseIds: string[] | null) {
  return useQuery({
    enabled: !!warehouseIds && warehouseIds.length > 0,
    queryKey: ["items-in-warehouses", warehouseIds?.slice().sort().join(",")],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouse_stock")
        .select("item_id")
        .in("warehouse_id", warehouseIds!);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => r.item_id as string)));
    },
  });
}
