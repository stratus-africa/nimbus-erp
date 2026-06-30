import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "./use-profile";

export type TransferAction = "request" | "approve" | "confirm" | "ship" | "receive" | "cancel";

const DEFAULTS: Record<TransferAction, string[]> = {
  request: ["company_admin", "inventory", "sales", "purchasing"],
  approve: ["company_admin"],
  confirm: ["company_admin", "inventory"],
  ship: ["company_admin", "inventory"],
  receive: ["company_admin", "inventory"],
  cancel: ["company_admin"],
};

export function useTransferPermissions() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const myRoles = (profile?.roles ?? []).map((r: any) => r.role as string);

  const { data: cfg } = useQuery({
    enabled: !!tenantId,
    queryKey: ["transfer-permissions", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_settings")
        .select("value")
        .eq("tenant_id", tenantId!)
        .eq("key", "transfer_orders")
        .maybeSingle();
      return ((data?.value as any)?.permissions as Record<TransferAction, string[]> | undefined) ?? null;
    },
  });

  const can = (action: TransferAction) => {
    if (myRoles.includes("super_admin") || myRoles.includes("company_admin")) return true;
    const allowed = cfg?.[action] ?? DEFAULTS[action];
    return myRoles.some((r) => allowed.includes(r));
  };

  return { can, config: cfg ?? DEFAULTS, defaults: DEFAULTS };
}
