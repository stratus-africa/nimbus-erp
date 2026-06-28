import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useExpenseCategories(tenantId?: string) {
  return useQuery({
    enabled: !!tenantId,
    queryKey: ["expense_categories", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories" as any)
        .select("id, name, parent_category_id, expense_account_id, is_active")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useExpenseAccounts(tenantId?: string) {
  // Accounts that can be Dr (expense) or Cr (cash/bank/credit card/payable)
  return useQuery({
    enabled: !!tenantId,
    queryKey: ["expense_accounts_picker", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, is_active")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function usePaymentAccounts(tenantId?: string) {
  return useQuery({
    enabled: !!tenantId,
    queryKey: ["expense_payment_accounts", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .in("account_type", ["cash", "bank", "credit_card", "accounts_payable", "other_current_liability"])
        .order("code");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}
