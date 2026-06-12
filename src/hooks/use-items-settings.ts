import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import {
  ITEMS_SETTINGS_DEFAULTS,
  itemsSettingsSchema,
  type ItemsSettings,
} from "@/lib/items-settings-schema";

const NS = "items";

export function useItemsSettings() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();

  const query = useQuery({
    enabled: !!tenantId,
    queryKey: ["tenant_settings", tenantId, NS],
    queryFn: async (): Promise<ItemsSettings> => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("settings")
        .eq("tenant_id", tenantId!)
        .eq("namespace", NS)
        .maybeSingle();
      if (error) throw error;
      const parsed = itemsSettingsSchema.safeParse({
        ...ITEMS_SETTINGS_DEFAULTS,
        ...((data?.settings as object) ?? {}),
      });
      return parsed.success ? parsed.data : ITEMS_SETTINGS_DEFAULTS;
    },
  });

  // Check whether any tracked items exist (locks valuation method)
  const trackedItemsQuery = useQuery({
    enabled: !!tenantId,
    queryKey: ["items_tracked_exists", tenantId],
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!)
        .eq("item_type", "inventory")
        .is("deleted_at", null);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

  const save = useMutation({
    mutationFn: async (next: ItemsSettings) => {
      if (!tenantId) throw new Error("No tenant");
      const validated = itemsSettingsSchema.parse(next);
      const { error } = await supabase
        .from("tenant_settings")
        .upsert(
          { tenant_id: tenantId, namespace: NS, settings: validated },
          { onConflict: "tenant_id,namespace" },
        );
      if (error) throw error;
      return validated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_settings", tenantId, NS] });
    },
  });

  return {
    settings: query.data ?? ITEMS_SETTINGS_DEFAULTS,
    isLoading: query.isLoading,
    hasTrackedItems: !!trackedItemsQuery.data,
    save,
  };
}
