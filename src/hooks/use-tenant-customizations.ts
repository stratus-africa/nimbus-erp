import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";

export type CustomizationTable =
  | "custom_fields"
  | "validation_rules"
  | "record_locks"
  | "custom_buttons"
  | "related_lists";

export function useCustomizations<T extends Record<string, any>>(
  table: CustomizationTable,
  entity: string,
) {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const key = [table, tenantId, entity] as const;

  const list = useQuery({
    enabled: !!tenantId,
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("entity", entity)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });

  const create = useMutation({
    mutationFn: async (row: Partial<T>) => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase
        .from(table as any)
        .insert({ ...row, tenant_id: tenantId, entity } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<T> }) => {
      const { error } = await supabase
        .from(table as any)
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { list, create, update, remove };
}
