import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/transfer-orders")({
  head: () => ({ meta: [{ title: "Transfer Order Permissions — Settings" }] }),
  component: TransferOrderSettings,
});

const ACTIONS = ["request", "approve", "confirm", "ship", "receive", "cancel"] as const;
const ROLES = ["company_admin", "accountant", "sales", "purchasing", "inventory", "readonly"] as const;

const DEFAULTS: Record<string, string[]> = {
  request: ["company_admin", "inventory", "sales", "purchasing"],
  approve: ["company_admin"],
  confirm: ["company_admin", "inventory"],
  ship: ["company_admin", "inventory"],
  receive: ["company_admin", "inventory"],
  cancel: ["company_admin"],
};

function TransferOrderSettings() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const [matrix, setMatrix] = useState<Record<string, string[]>>(DEFAULTS);

  const { data: row } = useQuery({
    enabled: !!tenantId,
    queryKey: ["to-settings", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("tenant_settings")
        .select("*").eq("tenant_id", tenantId!).eq("key", "transfer_orders").maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    const cfg = (row?.value as any)?.permissions;
    if (cfg) setMatrix({ ...DEFAULTS, ...cfg });
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      const value = { permissions: matrix };
      if (row) {
        const { error } = await supabase.from("tenant_settings").update({ value }).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_settings").insert({ tenant_id: tenantId!, key: "transfer_orders", value });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["to-settings"] }); qc.invalidateQueries({ queryKey: ["transfer-permissions"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (action: string, role: string) => {
    setMatrix((m) => {
      const cur = new Set(m[action] ?? []);
      cur.has(role) ? cur.delete(role) : cur.add(role);
      return { ...m, [action]: Array.from(cur) };
    });
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Transfer Order Permissions</h1>
        <p className="text-sm text-muted-foreground">Choose which roles can perform each action. Company Admins and Super Admins always have full access.</p>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr><th className="p-3 text-left">Action</th>{ROLES.map((r) => <th key={r} className="p-3 text-center capitalize">{r.replace("_"," ")}</th>)}</tr>
          </thead>
          <tbody>
            {ACTIONS.map((a) => (
              <tr key={a} className="border-b">
                <td className="p-3 font-medium capitalize">{a}</td>
                {ROLES.map((r) => (
                  <td key={r} className="p-3 text-center">
                    <Checkbox checked={(matrix[a] ?? []).includes(r)} onCheckedChange={() => toggle(a, r)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setMatrix(DEFAULTS)}>Reset to defaults</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </div>
    </div>
  );
}
