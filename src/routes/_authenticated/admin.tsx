import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { formatDate, statusLabel, STATUS_COLORS } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Super Admin — Nimbus ERP" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "super_admin");
    if (!roles?.length) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { data: tenants } = useQuery({
    enabled: !!profile?.isSuperAdmin,
    queryKey: ["admin-tenants"],
    queryFn: async () => (await supabase.from("tenants").select("*, subscription_plans(name)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: plans } = useQuery({
    enabled: !!profile?.isSuperAdmin,
    queryKey: ["admin-plans"],
    queryFn: async () => (await supabase.from("subscription_plans").select("*").order("price_monthly")).data ?? [],
  });

  const toggleStatus = async (id: string, status: "active" | "suspended" | "trial") => {
    const { error } = await supabase.from("tenants").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-tenants"] });
  };

  return (
    <div>
      <PageHeader title="Super Admin" description="Manage tenants and plans across the platform." />
      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle>Tenants</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Slug</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {tenants?.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                    <TableCell>{t.subscription_plans?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_COLORS[t.status] ?? ""}>{statusLabel(t.status)}</Badge></TableCell>
                    <TableCell>{formatDate(t.created_at)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {t.status !== "active" && <Button size="sm" variant="outline" onClick={() => toggleStatus(t.id, "active")}>Activate</Button>}
                      {t.status !== "suspended" && <Button size="sm" variant="outline" onClick={() => toggleStatus(t.id, "suspended")}>Suspend</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Subscription plans</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-right">Price / mo</TableHead><TableHead className="text-right">Max users</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
              <TableBody>
                {plans?.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">${Number(p.price_monthly).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{p.max_users}</TableCell>
                    <TableCell className="text-muted-foreground">{p.description ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
