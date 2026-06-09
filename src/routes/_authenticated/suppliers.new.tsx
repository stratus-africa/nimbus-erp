import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
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
import { Info, Mail, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/suppliers/new")({
  head: () => ({ meta: [{ title: "New Supplier — Nimbus ERP" }] }),
  component: NewSupplierPage,
});

const phoneRegex = /^[0-9\s+()-]*$/;

const schema = z.object({
  supplier_type: z.enum(["business", "individual"]),
  salutation: z.string().max(10).optional().or(z.literal("")),
  first_name: z.string().trim().max(60).optional().or(z.literal("")),
  last_name: z.string().trim().min(1, "Last name is required").max(60),
  company_name: z.string().trim().max(120).optional().or(z.literal("")),
  display_name: z.string().trim().min(1, "Display name is required").max(120),
  email: z.string().trim().max(255).email("Invalid email address").optional().or(z.literal("")),
  work_phone: z.string().trim().max(20).regex(phoneRegex, "Digits only").optional().or(z.literal("")),
  mobile: z.string().trim().max(20).regex(phoneRegex, "Digits only").optional().or(z.literal("")),
  language: z.string(),
  comm_email: z.boolean(),
  comm_whatsapp: z.boolean(),
  vat_treatment: z.string().min(1, "VAT treatment is required"),
  pin_number: z.string().trim().max(50).optional().or(z.literal("")),
  withholding_vat: z.boolean(),
  withholding_tax: z.boolean(),
  currency: z.string(),
  accounts_payable: z.string().optional().or(z.literal("")),
  opening_balance_branch: z.string(),
  opening_balance_amount: z.string().regex(/^-?\d*(\.\d{0,2})?$/, "Invalid amount").optional().or(z.literal("")),
  payment_terms: z.string(),
  enable_portal: z.boolean(),
  billing_address: z.string().max(500).optional().or(z.literal("")),
  shipping_address: z.string().max(500).optional().or(z.literal("")),
  remarks: z.string().max(1000).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
  supplier_type: "business",
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
  vat_treatment: "Registered Business",
  pin_number: "",
  withholding_vat: false,
  withholding_tax: false,
  currency: "KES",
  accounts_payable: "",
  opening_balance_branch: "Head Office",
  opening_balance_amount: "",
  payment_terms: "Due on Receipt",
  enable_portal: false,
  billing_address: "",
  shipping_address: "",
  remarks: "",
};

function Row({ label, required, info, error, children }: {
  label: string; required?: boolean; info?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-6 py-2">
      <Label className="pt-2 text-sm font-normal flex items-center gap-1.5">
        <span className={required ? "text-destructive" : ""}>{label}{required && "*"}</span>
        {info && <Info className="h-3.5 w-3.5 text-muted-foreground" />}
      </Label>
      <div className="max-w-2xl">
        {children}
        {error && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}

function NewSupplierPage() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onBlur",
  });
  const { register, handleSubmit, control, watch, formState, setValue } = form;
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = formState;

  const salutation = watch("salutation");
  const firstName = watch("first_name");
  const lastName = watch("last_name");
  const companyName = watch("company_name");
  const currency = watch("currency");

  const displayOptions = useMemo(() => {
    const opts: string[] = [];
    const fn = `${salutation ?? ""} ${firstName ?? ""} ${lastName ?? ""}`.trim();
    if (fn) opts.push(fn);
    if (companyName) opts.push(companyName);
    if (firstName && lastName) opts.push(`${lastName}, ${firstName}`);
    return Array.from(new Set(opts));
  }, [salutation, firstName, lastName, companyName]);

  const displayName = watch("display_name");
  useEffect(() => {
    if (!displayName && displayOptions[0]) {
      setValue("display_name", displayOptions[0], { shouldDirty: false, shouldValidate: false });
    }
  }, [displayOptions, displayName, setValue]);

  const shouldBlock = isDirty && !isSubmitSuccessful;
  useBlocker({
    shouldBlockFn: () => {
      if (!shouldBlock) return false;
      return !window.confirm("You have unsaved changes. Leave this page anyway?");
    },
    enableBeforeUnload: () => shouldBlock,
  });
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldBlock) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldBlock]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!tenantId) throw new Error("No tenant selected");
      const payload: any = {
        tenant_id: tenantId,
        name: values.display_name.trim(),
        contact_person: `${values.salutation ?? ""} ${values.first_name ?? ""} ${values.last_name ?? ""}`.trim() || null,
        email: values.email || null,
        phone: values.work_phone || values.mobile || null,
        pin_number: values.pin_number || null,
        address: values.billing_address || null,
        notes: values.remarks || null,
        payment_terms_days: values.payment_terms === "Due on Receipt"
          ? 0
          : Number(values.payment_terms.replace(/\D/g, "")) || 30,
      };
      const { data, error } = await supabase
        .from("suppliers")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Supplier created");
      navigate({ to: "/suppliers", search: { highlight: id } as any, replace: true });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onCancel = () => navigate({ to: "/suppliers" });

  return (
    <div className="-m-6">
      <div className="border-b bg-card px-6 py-4">
        <h1 className="text-xl font-semibold">New Supplier</h1>
      </div>

      <form
        onSubmit={handleSubmit(
          (v) => save.mutate(v),
          (errs) => {
            const first = Object.values(errs)[0] as any;
            toast.error(first?.message || "Please fix the highlighted fields");
          },
        )}
        noValidate
      >
        <div className="bg-card px-6 py-6">
          <div className="space-y-1">
            <Row label="Supplier Type" info>
              <Controller
                control={control}
                name="supplier_type"
                render={({ field }) => (
                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={field.value === "business"} onChange={() => field.onChange("business")} className="accent-primary" />
                      Business
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={field.value === "individual"} onChange={() => field.onChange("individual")} className="accent-primary" />
                      Individual
                    </label>
                  </div>
                )}
              />
            </Row>

            <Row label="Primary Contact" info error={errors.last_name?.message || errors.first_name?.message}>
              <div className="grid grid-cols-[120px_1fr_1fr] gap-3">
                <Controller
                  control={control}
                  name="salutation"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Salutation" /></SelectTrigger>
                      <SelectContent>
                        {["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Input placeholder="First Name" aria-invalid={!!errors.first_name} className={cn(errors.first_name && "border-destructive")} {...register("first_name")} />
                <Input placeholder="Last Name*" aria-invalid={!!errors.last_name} className={cn(errors.last_name && "border-destructive")} {...register("last_name")} />
              </div>
            </Row>

            <Row label="Company Name" error={errors.company_name?.message}>
              <Input aria-invalid={!!errors.company_name} className={cn(errors.company_name && "border-destructive")} {...register("company_name")} />
            </Row>

            <Row label="Display Name" required info error={errors.display_name?.message}>
              <Controller
                control={control}
                name="display_name"
                render={({ field }) => (
                  <>
                    <Input
                      list="supplier-display-name-options"
                      placeholder="Select or type to add"
                      aria-invalid={!!errors.display_name}
                      className={cn(errors.display_name && "border-destructive")}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <datalist id="supplier-display-name-options">
                      {displayOptions.map((o) => <option key={o} value={o} />)}
                    </datalist>
                  </>
                )}
              />
            </Row>

            <Row label="Email Address" info error={errors.email?.message}>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="email" className={cn("pl-9", errors.email && "border-destructive")} aria-invalid={!!errors.email} {...register("email")} />
              </div>
            </Row>

            <Row label="Phone" info error={errors.work_phone?.message || errors.mobile?.message}>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex">
                  <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted/40 text-sm text-muted-foreground">+254</div>
                  <Input placeholder="Work Phone" className={cn("rounded-l-none", errors.work_phone && "border-destructive")} {...register("work_phone")} />
                </div>
                <div className="flex">
                  <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted/40 text-sm text-muted-foreground">+254</div>
                  <Input placeholder="Mobile" className={cn("rounded-l-none", errors.mobile && "border-destructive")} {...register("mobile")} />
                </div>
              </div>
            </Row>

            <Row label="Supplier Language" info>
              <Controller
                control={control}
                name="language"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["English", "Swahili", "French", "Spanish"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Row>

            <Row label="Communication Channels">
              <div className="flex items-center gap-6 pt-2">
                <Controller control={control} name="comm_email" render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} /> Email
                  </label>
                )} />
                <Controller control={control} name="comm_whatsapp" render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} /> WhatsApp
                  </label>
                )} />
              </div>
            </Row>
          </div>

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
                <Row label="VAT Treatment" required error={errors.vat_treatment?.message}>
                  <Controller
                    control={control}
                    name="vat_treatment"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-invalid={!!errors.vat_treatment} className={cn(errors.vat_treatment && "border-destructive")}>
                          <SelectValue placeholder="" />
                        </SelectTrigger>
                        <SelectContent>
                          {["Registered Business", "Non Registered Business", "Overseas"].map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Row>
                <Row label="PIN Number">
                  <Input placeholder="KRA PIN / Tax ID" {...register("pin_number")} />
                </Row>
                <Row label="Withholding VAT">
                  <Controller control={control} name="withholding_vat" render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm pt-2">
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                      Apply Withholding VAT for this supplier
                    </label>
                  )} />
                </Row>
                <Row label="Withholding Tax">
                  <Controller control={control} name="withholding_tax" render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm pt-2">
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                      Enable Withholding Tax for this supplier
                    </label>
                  )} />
                </Row>
                <Row label="Currency">
                  <Controller control={control} name="currency" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["KES- Kenyan Shilling", "USD- US Dollar", "EUR- Euro", "GBP- British Pound"].map((s) => (
                          <SelectItem key={s} value={s.split("-")[0]}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </Row>
                <Row label="Accounts Payable" info>
                  <Controller control={control} name="accounts_payable" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ap-default">Accounts Payable</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </Row>
                <Row label="Opening Balance" error={errors.opening_balance_amount?.message}>
                  <div className="grid grid-cols-[180px_1fr] gap-3">
                    <Controller control={control} name="opening_balance_branch" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Head Office">Head Office</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                    <div className="flex">
                      <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted/40 text-sm text-muted-foreground">{currency}</div>
                      <Input className={cn("rounded-l-none", errors.opening_balance_amount && "border-destructive")} {...register("opening_balance_amount")} />
                    </div>
                  </div>
                </Row>
                <Row label="Payment Terms">
                  <Controller control={control} name="payment_terms" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </Row>
                <Row label="Enable Portal?" info>
                  <Controller control={control} name="enable_portal" render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm pt-2">
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                      Allow portal access for this supplier
                    </label>
                  )} />
                </Row>
                <Row label="Documents">
                  <div>
                    <Button variant="outline" type="button" className="gap-2"><Upload className="h-4 w-4" /> Upload File</Button>
                    <p className="mt-1.5 text-xs text-muted-foreground">You can upload a maximum of 10 files, 10MB each</p>
                  </div>
                </Row>
              </TabsContent>

              <TabsContent value="address" className="pt-6 space-y-1">
                <Row label="Billing Address" error={errors.billing_address?.message}>
                  <Textarea rows={3} {...register("billing_address")} />
                </Row>
                <Row label="Shipping Address" error={errors.shipping_address?.message}>
                  <Textarea rows={3} {...register("shipping_address")} />
                </Row>
              </TabsContent>

              <TabsContent value="contacts" className="pt-6 text-sm text-muted-foreground">No additional contacts yet.</TabsContent>
              <TabsContent value="custom" className="pt-6 text-sm text-muted-foreground">No custom fields configured.</TabsContent>
              <TabsContent value="tags" className="pt-6 text-sm text-muted-foreground">No reporting tags.</TabsContent>
              <TabsContent value="remarks" className="pt-6">
                <Textarea rows={4} placeholder="Internal notes…" {...register("remarks")} />
                {errors.remarks && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" /> {errors.remarks.message}
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="mt-8 border-t pt-6">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Supplier Owner:</span> Assign a user as the supplier owner to provide access only to the data of this supplier.{" "}
              <button type="button" className="text-primary hover:underline">Learn More</button>
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 border-t bg-card px-6 py-3 flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting || save.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {isSubmitting || save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          {Object.keys(errors).length > 0 && (
            <p className="text-xs text-destructive ml-2">Fix the highlighted fields above.</p>
          )}
        </div>
      </form>
    </div>
  );
}
