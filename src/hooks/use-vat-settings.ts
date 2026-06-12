import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import {
  VAT_SETTINGS_DEFAULTS,
  vatSettingsSchema,
  type VATSettings,
} from "@/lib/vat-settings-schema";

const NS = "vat";

export function useVATSettings() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();

  const query = useQuery({
    enabled: !!tenantId,
    queryKey: ["tenant_settings", tenantId, NS],
    queryFn: async (): Promise<VATSettings> => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("settings")
        .eq("tenant_id", tenantId!)
        .eq("namespace", NS)
        .maybeSingle();
      if (error) throw error;
      const parsed = vatSettingsSchema.safeParse({
        ...VAT_SETTINGS_DEFAULTS,
        ...((data?.settings as object) ?? {}),
      });
      return parsed.success ? parsed.data : VAT_SETTINGS_DEFAULTS;
    },
  });

  const save = useMutation({
    mutationFn: async (next: VATSettings) => {
      if (!tenantId) throw new Error("No tenant");
      const validated = vatSettingsSchema.parse(next);
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
    settings: query.data ?? VAT_SETTINGS_DEFAULTS,
    isLoading: query.isLoading,
    save,
  };
}
