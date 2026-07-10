import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { formatDate, statusLabel, STATUS_COLORS } from "@/lib/format";
import { toast } from "sonner";
import { Building2, Users, CreditCard, FileText, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Super Admin — Nimbus ERP" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "super_admin");
    if (!roles?.length) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="rounded-md bg-muted p-2.5">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [userQ, setUserQ] = useState("");

  const { data: tenants } = useQuery({
    enabled: !!profile?.isSuperAdmin,
    queryKey: ["admin-tenants"],
    queryFn: async () =>
      (
        await supabase
          .from("tenants")
          .select("*, subscription_plans(name)")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const { data: plans } = useQuery({
    enabled: !!profile?.isSuperAdmin,
    queryKey: ["admin-plans"],
    queryFn: async () =>
      (await supabase.from("subscription_plans").select("*").order("price_monthly")).data ??
      [],
  });

  const { data: memberCount } = useQuery({
    enabled: !!profile?.isSuperAdmin,
    queryKey: ["admin-member-count"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("tenant_members")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: invoiceStats } = useQuery({
    enabled: !!profile?.isSuperAdmin,
    queryKey: ["admin-invoice-stats"],
    queryFn: async () => {
      const { data, count } = await (supabase as any)
        .from("invoices")
        .select("total", { count: "exact" })
        .limit(1000);
      const total = (data ?? []).reduce(
        (s: number, r: any) => s + Number(r.total ?? 0),
        0,
      );
      return { count: count ?? 0, sample_total: total };
    },
  });

  const { data: members } = useQuery({
    enabled: !!profile?.isSuperAdmin,
    queryKey: ["admin-members-list"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tenant_members")
        .select("user_id, role, tenant_id, joined_at, tenants(name), profiles:user_id(email, full_name)")
        .order("joined_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const filteredMembers = useMemo(() => {
    const q = userQ.trim().toLowerCase();
    if (!q) return members ?? [];
    return (members ?? []).filter(
      (m: any) =>
        m.profiles?.email?.toLowerCase().includes(q) ||
        m.profiles?.full_name?.toLowerCase().includes(q) ||
        m.tenants?.name?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q),
    );
  }, [members, userQ]);

  const toggleStatus = async (id: string, status: "active" | "suspended" | "trial") => {
    const { error } = await supabase.from("tenants").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-tenants"] });
  };

  const activeTenants = (tenants ?? []).filter((t: any) => t.status === "active").length;
  const suspendedTenants = (tenants ?? []).filter((t: any) => t.status === "suspended").length;

  return (
    <div>
      <PageHeader
        title="Super Admin"
        description="Manage tenants, users, plans, and platform-wide activity."
      />

      {/* Platform metrics */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Building2}
          label="Tenants"
          value={tenants?.length ?? "—"}
          sub={`${activeTenants} active · ${suspendedTenants} suspended`}
        />
        <Metric
          icon={Users}
          label="Members"
          value={memberCount ?? "—"}
          sub="across all tenants"
        />
        <Metric
          icon={CreditCard}
          label="Plans"
          value={plans?.length ?? "—"}
          sub="subscription tiers"
        />
        <Metric
          icon={FileText}
          label="Invoices"
          value={invoiceStats?.count ?? "—"}
          sub="platform-wide"
        />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants?.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                    <TableCell>{t.subscription_plans?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[t.status] ?? ""}>
                        {statusLabel(t.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(t.created_at)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {t.status !== "active" && (
                        <Button size="sm" variant="outline" onClick={() => toggleStatus(t.id, "active")}>
                          Activate
                        </Button>
                      )}
                      {t.status !== "suspended" && (
                        <Button size="sm" variant="outline" onClick={() => toggleStatus(t.id, "suspended")}>
                          Suspend
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Global users</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={userQ}
                onChange={(e) => setUserQ(e.target.value)}
                placeholder="Search by email, name, tenant, role…"
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(filteredMembers ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      No users match.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMembers.map((m: any) => (
                    <TableRow key={`${m.user_id}-${m.tenant_id}`}>
                      <TableCell className="font-mono text-xs">{m.profiles?.email ?? "—"}</TableCell>
                      <TableCell>{m.profiles?.full_name ?? "—"}</TableCell>
                      <TableCell>{m.tenants?.name ?? "—"}</TableCell>
                      <TableCell className="capitalize">{m.role?.replace("_", " ")}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(m.joined_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription plans</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Price / mo</TableHead>
                  <TableHead className="text-right">Max users</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
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
