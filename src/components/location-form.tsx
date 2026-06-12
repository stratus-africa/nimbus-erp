import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Form = {
  name: string;
  branch: string;
  attention: string;
  street1: string;
  street2: string;
  city: string;
  country: string;
  state: string;
  zip_code: string;
  phone: string;
  email: string;
  is_primary: boolean;
};

const EMPTY: Form = {
  name: "", branch: "", attention: "", street1: "", street2: "",
  city: "", country: "Kenya", state: "", zip_code: "", phone: "", email: "",
  is_primary: false,
};

const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "South Africa", "United States", "United Kingdom"];

export function LocationForm({ locationId }: { locationId?: string }) {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!locationId;
  const [form, setForm] = useState<Form>(EMPTY);

  const { data: existing } = useQuery({
    queryKey: ["location", locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations" as any)
        .select("*")
        .eq("id", locationId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name ?? "",
        branch: existing.branch ?? "",
        attention: existing.attention ?? "",
        street1: existing.street1 ?? "",
        street2: existing.street2 ?? "",
        city: existing.city ?? "",
        country: existing.country ?? "Kenya",
        state: existing.state ?? "",
        zip_code: existing.zip_code ?? "",
        phone: existing.phone ?? "",
        email: existing.email ?? "",
      });
    }
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      if (!form.country.trim()) throw new Error("Country is required");
      if (!tenantId) throw new Error("No tenant");
      const payload = {
        ...form,
        tenant_id: tenantId,
        name: form.name.trim(),
      };
      if (isEdit) {
        const { error } = await supabase.from("locations" as any).update(payload).eq("id", locationId!);
        if (error) throw error;
      } else {
        // mark first ever location as primary
        const { count } = await supabase
          .from("locations" as any)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId);
        const { error } = await supabase.from("locations" as any).insert({
          ...payload,
          is_primary: !count || count === 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Location updated" : "Location created");
      qc.invalidateQueries({ queryKey: ["locations", tenantId] });
      navigate({ to: "/settings/locations" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-muted/30">
      <div className="mx-auto max-w-2xl py-8 px-4">
        <div className="rounded-lg border bg-card shadow-sm">
          {/* green accent bar */}
          <div className="h-1 bg-emerald-500 rounded-t-lg" />
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Location" : "New Location"}</h1>
            <button
              type="button"
              className="text-rose-500 hover:text-rose-600"
              onClick={() => navigate({ to: "/settings/locations" })}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
            className="p-5 space-y-4"
          >
            <div>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Location name"
                className="h-10"
              />
            </div>

            <Row label="Branch">
              <Input
                value={form.branch}
                onChange={(e) => update("branch", e.target.value)}
                placeholder="Branch name"
              />
            </Row>

            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs flex gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div><span className="font-semibold text-amber-700 dark:text-amber-400">NOTE</span> Only the users who are a part of the selected branch can be provided permission to access this location.</div>
            </div>

            <Row label="Attention">
              <Input value={form.attention} onChange={(e) => update("attention", e.target.value)} />
            </Row>
            <Row label="Street 1">
              <Input value={form.street1} onChange={(e) => update("street1", e.target.value)} />
            </Row>
            <Row label="Street 2">
              <Input value={form.street2} onChange={(e) => update("street2", e.target.value)} />
            </Row>
            <Row label="City">
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </Row>
            <Row label={<span className="text-rose-500">Country/Region*</span>}>
              <Select value={form.country} onValueChange={(v) => update("country", v)}>
                <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="State">
              <Input value={form.state} onChange={(e) => update("state", e.target.value)} />
            </Row>
            <Row label="ZIP Code">
              <Input value={form.zip_code} onChange={(e) => update("zip_code", e.target.value)} />
            </Row>
            <Row label="Phone">
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </Row>
            <Row label="Email">
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </Row>

            <div className="flex gap-2 pt-4 border-t">
              <Button
                type="submit"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/settings/locations" })}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <Label className="text-sm font-normal text-foreground/80">{label}</Label>
      <div>{children}</div>
    </div>
  );
}
