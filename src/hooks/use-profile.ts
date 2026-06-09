import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      const { data: memberships } = await supabase
        .from("tenant_members")
        .select("tenant_id, tenants(id, name, slug, base_currency, status)")
        .eq("user_id", u.user.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", u.user.id);
      const currentTenant =
        memberships?.find((m: any) => m.tenant_id === profile?.current_tenant_id)?.tenants ??
        memberships?.[0]?.tenants ??
        null;
      return {
        user: u.user,
        profile,
        memberships: memberships ?? [],
        roles: roles ?? [],
        currentTenant,
        isSuperAdmin: (roles ?? []).some((r: any) => r.role === "super_admin"),
      };
    },
  });
}
