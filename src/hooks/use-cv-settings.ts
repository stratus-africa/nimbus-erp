import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import {
  CV_SETTINGS_DEFAULTS,
  cvSettingsSchema,
  type CVSettings,
} from "@/lib/cv-settings-schema";

const NS = "customers_vendors";

export function useCVSettings() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();

  const query = useQuery({
    enabled: !!tenantId,
    queryKey: ["tenant_settings", tenantId, NS],
    queryFn: async (): Promise<CVSettings> => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("settings")
        .eq("tenant_id", tenantId!)
        .eq("namespace", NS)
        .maybeSingle();
      if (error) throw error;
      const parsed = cvSettingsSchema.safeParse({
        ...CV_SETTINGS_DEFAULTS,
        ...((data?.settings as object) ?? {}),
      });
      return parsed.success ? parsed.data : CV_SETTINGS_DEFAULTS;
    },
  });

  const save = useMutation({
    mutationFn: async (next: CVSettings) => {
      if (!tenantId) throw new Error("No tenant");
      const validated = cvSettingsSchema.parse(next);
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
    settings: query.data ?? CV_SETTINGS_DEFAULTS,
    isLoading: query.isLoading,
    save,
  };
}
