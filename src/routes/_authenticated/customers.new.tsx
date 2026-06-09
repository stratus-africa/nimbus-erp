import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, Mail, Upload } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/customers/new")({
  head: () => ({ meta: [{ title: "New Customer — Nimbus ERP" }] }),
  component: NewCustomerPage,
});

type Form = {
  customer_type: "business" | "individual";
  salutation: string;
  first_name: string;
  last_name: string;
  company_name: string;
  display_name: string;
  email: string;
  work_phone: string;
  mobile: string;
  language: string;
  comm_email: boolean;
  comm_whatsapp: boolean;
  vat_treatment: string;
  tax_exemption_no: string;
  withholding_vat: boolean;
  withholding_tax: boolean;
  location_code: string;
  currency: string;
  accounts_receivable: string;
  opening_balance_branch: string;
  opening_balance_amount: string;
  payment_terms: string;
  enable_portal: boolean;
  billing_address: string;
  shipping_address: string;
  remarks: string;
};

const initial: Form = {
  customer_type: "business",
  salutation: "",
  first_name: "",
  last_name: "",
  company_name: "",
  display_name: "",
  email: "",
  work_phone: "",
  mobile: "",
  language: "English",
  comm_email: true,
  comm_whatsapp: false,
  vat_treatment: "",
  tax_exemption_no: "",
  withholding_vat: false,
  withholding_tax: false,
  location_code: "",
  currency: "KES",
  accounts_receivable: "",
  opening_balance_branch: "Head Office",
  opening_balance_amount: "",
  payment_terms: "Due on Receipt",
  enable_portal: false,
  billing_address: "",
  shipping_address: "",
  remarks: "",
};

function Row({ label, required, info, children }: { label: string; required?: boolean; info?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-6 py-2">
      <Label className="pt-2 text-sm font-normal flex items-center gap-1.5">
        <span className={required ? "text-destructive" : ""}>{label}{required && "*"}</span>
        {info && <Info className="h-3.5 w-3.5 text-muted-foreground" />}
      </Label>
      <div className="max-w-2xl">{children}</div>
    </div>
  );
}

function NewCustomerPage() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const [f, setF] = useState<Form>(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const displayOptions = useMemo(() => {
    const opts: string[] = [];
    const fn = `${f.salutation} ${f.first_name} ${f.last_name}`.trim();
    if (fn) opts.push(fn);
    if (f.company_name) opts.push(f.company_name);
    if (f.first_name && f.last_name) opts.push(`${f.last_name}, ${f.first_name}`);
    return Array.from(new Set(opts));
  }, [f.salutation, f.first_name, f.last_name, f.company_name]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const name = f.display_name || `${f.first_name} ${f.last_name}`.trim() || f.company_name;
      if (!name) throw new Error("Display name is required");
      const payload: any = {
        tenant_id: tenantId,
        name,
        company_name: f.company_name || null,
        contact_person: `${f.salutation} ${f.first_name} ${f.last_name}`.trim() || null,
        email: f.email || null,
        phone: f.work_phone || f.mobile || null,
        vat_number: f.tax_exemption_no || null,
        billing_address: f.billing_address || null,
        shipping_address: f.shipping_address || null,
        payment_terms_days: f.payment_terms === "Due on Receipt" ? 0 : 30,
        notes: f.remarks || null,
      };
      const { error } = await supabase.from("customers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Customer created"); navigate({ to: "/customers" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="-m-6">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <h1 className="text-xl font-semibold">New Customer</h1>
      </div>

      <div className="bg-card px-6 py-6">
        <div className="space-y-1">
          <Row label="Customer Type" info>
            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={f.customer_type === "business"} onChange={() => set("customer_type", "business")} className="accent-primary" />
                Business
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={f.customer_type === "individual"} onChange={() => set("customer_type", "individual")} className="accent-primary" />
                Individual
              </label>
            </div>
          </Row>

          <Row label="Primary Contact" info>
            <div className="space-y-1.5">
              <div className="grid grid-cols-[120px_1fr_1fr] gap-3">
                <Select value={f.salutation} onValueChange={(v) => set("salutation", v)}>
                  <SelectTrigger><SelectValue placeholder="Salutation" /></SelectTrigger>
                  <SelectContent>
                    {["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="First Name" value={f.first_name} onChange={(e) => set("first_name", e.target.value)} />
                <Input placeholder="Last Name*" value={f.last_name} onChange={(e) => set("last_name", e.target.value)} />
              </div>
            </div>
          </Row>

          <Row label="Company Name">
            <Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} />
          </Row>

          <Row label="Display Name" required info>
            <Select value={f.display_name} onValueChange={(v) => set("display_name", v)}>
              <SelectTrigger><SelectValue placeholder="Select or type to add" /></SelectTrigger>
              <SelectContent>
                {displayOptions.length === 0 ? <SelectItem value="—" disabled>Fill in contact info first</SelectItem> :
                  displayOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Email Address" info>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="email" className="pl-9" value={f.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </Row>

          <Row label="Phone" info>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex">
                <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted/40 text-sm text-muted-foreground">+254</div>
                <Input placeholder="Work Phone" className="rounded-l-none" value={f.work_phone} onChange={(e) => set("work_phone", e.target.value)} />
              </div>
              <div className="flex">
                <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted/40 text-sm text-muted-foreground">+254</div>
                <Input placeholder="Mobile" className="rounded-l-none" value={f.mobile} onChange={(e) => set("mobile", e.target.value)} />
              </div>
            </div>
          </Row>

          <Row label="Customer Language" info>
            <Select value={f.language} onValueChange={(v) => set("language", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["English", "Swahili", "French", "Spanish"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Communication Channels">
            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.comm_email} onCheckedChange={(v) => set("comm_email", !!v)} /> Email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.comm_whatsapp} onCheckedChange={(v) => set("comm_whatsapp", !!v)} /> WhatsApp
              </label>
            </div>
          </Row>
        </div>

        {/* Tabs */}
        <div className="mt-8">
          <Tabs defaultValue="other">
            <TabsList className="w-full justify-start gap-6 rounded-none border-b bg-transparent p-0 h-auto">
              {[
                { v: "other", l: "Other Details" },
                { v: "address", l: "Address" },
                { v: "contacts", l: "Contact Persons" },
                { v: "custom", l: "Custom Fields" },
                { v: "tags", l: "Reporting Tags" },
                { v: "remarks", l: "Remarks" },
              ].map((t) => (
                <TabsTrigger
                  key={t.v}
                  value={t.v}
                  className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground"
                >
                  {t.l}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="other" className="pt-6 space-y-1">
              <Row label="VAT Treatment" required>
                <Select value={f.vat_treatment} onValueChange={(v) => set("vat_treatment", v)}>
                  <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                  <SelectContent>
                    {["Registered Business", "Non Registered Business", "Overseas"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Tax Exemption Certificate Number">
                <Input placeholder="Number" value={f.tax_exemption_no} onChange={(e) => set("tax_exemption_no", e.target.value)} />
              </Row>
              <Row label="Withholding VAT">
                <label className="flex items-center gap-2 text-sm pt-2">
                  <Checkbox checked={f.withholding_vat} onCheckedChange={(v) => set("withholding_vat", !!v)} /> Apply Withholding VAT for this customer
                </label>
              </Row>
              <Row label="Withholding Tax">
                <label className="flex items-center gap-2 text-sm pt-2">
                  <Checkbox checked={f.withholding_tax} onCheckedChange={(v) => set("withholding_tax", !!v)} /> Enable Withholding Tax for this Customer
                </label>
              </Row>
              <Row label="Location Code" info>
                <Input value={f.location_code} onChange={(e) => set("location_code", e.target.value)} />
              </Row>
              <Row label="Currency">
                <Select value={f.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["KES- Kenyan Shilling", "USD- US Dollar", "EUR- Euro", "GBP- British Pound"].map((s) =>
                      <SelectItem key={s} value={s.split("-")[0]}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Accounts Receivable" info>
                <Select value={f.accounts_receivable} onValueChange={(v) => set("accounts_receivable", v)}>
                  <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar-default">Accounts Receivable</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Opening Balance">
                <div className="grid grid-cols-[180px_1fr] gap-3">
                  <Select value={f.opening_balance_branch} onValueChange={(v) => set("opening_balance_branch", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Head Office">Head Office</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex">
                    <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted/40 text-sm text-muted-foreground">{f.currency}</div>
                    <Input className="rounded-l-none" value={f.opening_balance_amount} onChange={(e) => set("opening_balance_amount", e.target.value)} />
                  </div>
                </div>
              </Row>
              <Row label="Payment Terms">
                <Select value={f.payment_terms} onValueChange={(v) => set("payment_terms", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Enable Portal?" info>
                <label className="flex items-center gap-2 text-sm pt-2">
                  <Checkbox checked={f.enable_portal} onCheckedChange={(v) => set("enable_portal", !!v)} /> Allow portal access for this customer
                </label>
              </Row>
              <Row label="Documents">
                <div>
                  <Button variant="outline" type="button" className="gap-2"><Upload className="h-4 w-4" /> Upload File</Button>
                  <p className="mt-1.5 text-xs text-muted-foreground">You can upload a maximum of 10 files, 10MB each</p>
                </div>
              </Row>
            </TabsContent>

            <TabsContent value="address" className="pt-6 space-y-1">
              <Row label="Billing Address">
                <Textarea rows={3} value={f.billing_address} onChange={(e) => set("billing_address", e.target.value)} />
              </Row>
              <Row label="Shipping Address">
                <Textarea rows={3} value={f.shipping_address} onChange={(e) => set("shipping_address", e.target.value)} />
              </Row>
            </TabsContent>

            <TabsContent value="contacts" className="pt-6 text-sm text-muted-foreground">No additional contacts yet.</TabsContent>
            <TabsContent value="custom" className="pt-6 text-sm text-muted-foreground">No custom fields configured.</TabsContent>
            <TabsContent value="tags" className="pt-6 text-sm text-muted-foreground">No reporting tags.</TabsContent>
            <TabsContent value="remarks" className="pt-6">
              <Textarea rows={4} placeholder="Internal notes…" value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </TabsContent>
          </Tabs>
        </div>

        <button className="mt-6 text-sm font-medium text-primary hover:underline">Add more details</button>

        <div className="mt-8 border-t pt-6">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Customer Owner:</span> Assign a user as the customer owner to provide access only to the data of this customer.{" "}
            <button className="text-primary hover:underline">Learn More</button>
          </p>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 border-t bg-card px-6 py-3 flex items-center gap-3">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !f.display_name}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={() => navigate({ to: "/customers" })}>Cancel</Button>
      </div>
    </div>
  );
}
