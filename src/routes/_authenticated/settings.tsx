import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Nimbus ERP" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [address, setAddress] = useState("");
  const [taxNumber, setTaxNumber] = useState("");

  useEffect(() => {
    if (profile?.currentTenant) {
      const t: any = profile.currentTenant;
      setName(t.name ?? "");
      setCurrency(t.base_currency ?? "USD");
      setAddress(t.address ?? "");
      setTaxNumber(t.tax_number ?? "");
    }
  }, [profile]);

  const saveCompany = async () => {
    if (!tenantId) return;
    const { error } = await supabase.from("tenants").update({ name, base_currency: currency, address, tax_number: taxNumber }).eq("id", tenantId);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your workspace." />
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="taxes">Tax Rates</TabsTrigger>
          <TabsTrigger value="numbering">Numbering</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card>
            <CardHeader><CardTitle>Company profile</CardTitle><CardDescription>Information shown on documents.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Company name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Base currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["USD", "EUR", "GBP", "INR", "AUD", "CAD", "AED", "SAR", "NGN", "KES", "ZAR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Tax number</Label><Input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              <div className="sm:col-span-2"><Button onClick={saveCompany}>Save changes</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users"><UsersTab tenantId={tenantId!} /></TabsContent>
        <TabsContent value="taxes"><TaxesTab tenantId={tenantId!} /></TabsContent>
        <TabsContent value="numbering"><NumberingTab tenantId={tenantId!} /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab({ tenantId }: { tenantId: string }) {
  const { data } = useQuery({
    enabled: !!tenantId,
    queryKey: ["tenant-members", tenantId],
    queryFn: async () => {
      const { data: members } = await supabase.from("tenant_members").select("user_id, joined_at, profiles!inner(full_name, email)").eq("tenant_id", tenantId);
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").eq("tenant_id", tenantId);
      return (members ?? []).map((m: any) => ({ ...m, role: roles?.find((r: any) => r.user_id === m.user_id)?.role ?? "—" }));
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle>Team</CardTitle><CardDescription>Members of this workspace.</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((m: any) => (
              <TableRow key={m.user_id}>
                <TableCell>{m.profiles?.full_name ?? "—"}</TableCell>
                <TableCell>{m.profiles?.email ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{String(m.role).replace("_", " ")}</Badge></TableCell>
                <TableCell>{new Date(m.joined_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TaxesTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ enabled: !!tenantId, queryKey: ["tax-rates", tenantId], queryFn: async () => (await supabase.from("tax_rates").select("*").eq("tenant_id", tenantId).order("rate")).data ?? [] });
  const [name, setName] = useState(""); const [rate, setRate] = useState("0");
  const add = async () => {
    if (!name) return;
    const { error } = await supabase.from("tax_rates").insert({ tenant_id: tenantId, name, rate: parseFloat(rate) || 0 });
    if (error) return toast.error(error.message);
    setName(""); setRate("0");
    qc.invalidateQueries({ queryKey: ["tax-rates"] });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Tax rates</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-2">
          <Input placeholder="Name (e.g. VAT 16%)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input className="w-32" type="number" step="0.01" placeholder="Rate %" value={rate} onChange={(e) => setRate(e.target.value)} />
          <Button onClick={add}>Add</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Default</TableHead></TableRow></TableHeader>
          <TableBody>{data?.map((r: any) => <TableRow key={r.id}><TableCell>{r.name}</TableCell><TableCell className="text-right">{Number(r.rate).toFixed(2)}%</TableCell><TableCell>{r.is_default ? "Yes" : "—"}</TableCell></TableRow>)}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NumberingTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ enabled: !!tenantId, queryKey: ["numbering", tenantId], queryFn: async () => (await supabase.from("numbering_series").select("*").eq("tenant_id", tenantId).order("doc_type")).data ?? [] });
  const update = async (id: string, prefix: string, next: number) => {
    const { error } = await supabase.from("numbering_series").update({ prefix, next_number: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["numbering"] });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Document numbering</CardTitle><CardDescription>Customize prefixes and starting numbers.</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Prefix</TableHead><TableHead>Next #</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((r: any) => (
              <NumberingRow key={r.id} row={r} onSave={update} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NumberingRow({ row, onSave }: { row: any; onSave: (id: string, prefix: string, next: number) => void }) {
  const [prefix, setPrefix] = useState(row.prefix);
  const [next, setNext] = useState(row.next_number);
  return (
    <TableRow>
      <TableCell className="capitalize">{String(row.doc_type).replace("_", " ")}</TableCell>
      <TableCell><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8" /></TableCell>
      <TableCell><Input type="number" value={next} onChange={(e) => setNext(parseInt(e.target.value) || 1)} className="h-8 w-24" /></TableCell>
      <TableCell><Button size="sm" variant="outline" onClick={() => onSave(row.id, prefix, next)}>Save</Button></TableCell>
    </TableRow>
  );
}
