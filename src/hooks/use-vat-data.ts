import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";

export type VATRate = {
  id: string;
  tenant_id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
  tax_type: "sales" | "purchase" | "both";
};

export type VATRule = {
  id: string;
  tenant_id: string;
  name: string;
  transaction_type: "sales" | "purchases";
  tax_rate_id: string | null;
  is_default: boolean;
  is_system: boolean;
};

export function useVATRates() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();

  const list = useQuery({
    enabled: !!tenantId,
    queryKey: ["tax_rates", tenantId],
    queryFn: async (): Promise<VATRate[]> => {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("id,tenant_id,name,rate,is_default,is_active,tax_type")
        .eq("tenant_id", tenantId!)
        .order("rate", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VATRate[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tax_rates", tenantId] });

  const create = useMutation({
    mutationFn: async (input: { name: string; rate: number; tax_type: VATRate["tax_type"]; is_default?: boolean }) => {
      if (!tenantId) throw new Error("No tenant");
      const { data, error } = await supabase
        .from("tax_rates")
        .insert({ ...input, tenant_id: tenantId, is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<VATRate> & { id: string }) => {
      const { data, error } = await supabase.from("tax_rates").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tax_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { rates: list.data ?? [], isLoading: list.isLoading, create, update, remove };
}

export function useVATRules() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();

  const list = useQuery({
    enabled: !!tenantId,
    queryKey: ["vat_rules", tenantId],
    queryFn: async (): Promise<VATRule[]> => {
      const { data, error } = await supabase
        .from("vat_rules")
        .select("id,tenant_id,name,transaction_type,tax_rate_id,is_default,is_system")
        .eq("tenant_id", tenantId!)
        .order("transaction_type")
        .order("name");
      if (error) throw error;
      return (data ?? []) as VATRule[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["vat_rules", tenantId] });

  const create = useMutation({
    mutationFn: async (input: Omit<VATRule, "id" | "tenant_id" | "is_system">) => {
      if (!tenantId) throw new Error("No tenant");
      const { data, error } = await supabase
        .from("vat_rules")
        .insert({ ...input, tenant_id: tenantId, is_system: false })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<VATRule> & { id: string }) => {
      const { data, error } = await supabase.from("vat_rules").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vat_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { rules: list.data ?? [], isLoading: list.isLoading, create, update, remove };
}
