import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCVSettings } from "@/hooks/use-cv-settings";

type DocKind = "invoice" | "quote" | "sales_order";

/**
 * Computes the customer's current credit-limit exposure and whether the document
 * being edited would breach it. Respects the tenant's `customerCreditLimitEnabled`
 * and `includeSalesOrdersInCreditLimit` settings.
 *
 * Open balance = sum of open invoices (always) + open sales orders (only if the
 * tenant setting includes them). The current document being edited is excluded
 * from the open balance to avoid double counting.
 */
export function useCreditLimitCheck(params: {
  tenantId: string | undefined;
  customerId: string | undefined;
  docKind: DocKind;
  docId?: string | null;
  docTotal: number;
}) {
  const { tenantId, customerId, docKind, docId, docTotal } = params;
  const { settings } = useCVSettings();
  const enabled = !!settings?.customerCreditLimitEnabled;
  const includeSOs = !!settings?.includeSalesOrdersInCreditLimit;
  const action = settings?.creditLimitExceededAction ?? "warn";

  const { data } = useQuery({
    enabled: enabled && !!tenantId && !!customerId,
    queryKey: ["credit-limit", tenantId, customerId, includeSOs, docKind, docId ?? null],
    queryFn: async () => {
      const { data: c } = await supabase
        .from("customers").select("credit_limit, name").eq("id", customerId!).maybeSingle();
      const limit = Number((c as any)?.credit_limit ?? 0);

      // Open invoices always count
      let invQ = (supabase as any).from("invoices").select("balance_due, id")
        .eq("tenant_id", tenantId).eq("customer_id", customerId)
        .not("status", "in", "(paid,cancelled,draft)");
      if (docId && docKind === "invoice") invQ = invQ.neq("id", docId);
      const { data: inv } = await invQ;
      const openInvoices = (inv ?? []).reduce((s: number, r: any) => s + Number(r.balance_due ?? 0), 0);

      // Open SOs only if the setting includes them
      let openSOs = 0;
      if (includeSOs) {
        let soQ = (supabase as any).from("sales_orders").select("total, id")
          .eq("tenant_id", tenantId).eq("customer_id", customerId)
          .not("status", "in", "(cancelled,closed,draft)");
        if (docId && docKind === "sales_order") soQ = soQ.neq("id", docId);
        const { data: so } = await soQ;
        openSOs = (so ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      }

      return {
        limit,
        openBalance: openInvoices + openSOs,
        name: (c as any)?.name ?? "",
      };
    },
  });

  const limit = Number(data?.limit ?? 0);
  const openBalance = Number(data?.openBalance ?? 0);
  const projected = openBalance + Number(docTotal || 0);
  const exceeds = enabled && limit > 0 && projected > limit;

  return {
    enabled,
    action,
    limit,
    openBalance,
    projectedExposure: projected,
    exceeds,
    customerName: data?.name ?? "",
  };
}
