import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImageIcon, RefreshCw, Search, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/items/new")({
  head: () => ({ meta: [{ title: "New Item — Nimbus ERP" }] }),
  component: NewItemPage,
});

const schema = z
  .object({
    type: z.enum(["goods", "service"]),
    name: z.string().trim().min(1, "Name is required").max(200),
    sku: z.string().trim().max(64).optional().or(z.literal("")),
    unit: z.string().trim().min(1, "Unit is required").max(32),
    hs_code: z.string().trim().max(32).optional().or(z.literal("")),
    sellable: z.boolean(),
    purchasable: z.boolean(),
    selling_price: z.coerce.number().min(0, "Must be ≥ 0").max(1e12),
    cost_price: z.coerce.number().min(0, "Must be ≥ 0").max(1e12),
    sales_account: z.string().uuid().optional().or(z.literal("")),
    purchase_account: z.string().uuid().optional().or(z.literal("")),
    sales_vat: z.string().uuid().optional().or(z.literal("")),
    purchase_vat: z.string().uuid().optional().or(z.literal("")),
    sales_desc: z.string().max(1000).optional().or(z.literal("")),
    purchase_desc: z.string().max(1000).optional().or(z.literal("")),
    preferred_vendor: z.string().uuid().optional().or(z.literal("")),
    track_inventory: z.boolean(),
    inventory_account: z.string().uuid().optional().or(z.literal("")),
    valuation: z.enum(["fifo", "wac"]),
    reorder_level: z.coerce.number().min(0).max(1e12),
  })
  .refine((d) => d.sellable || d.purchasable, {
    message: "Item must be sellable or purchasable",
    path: ["sellable"],
  })
  .refine((d) => !d.sellable || d.selling_price > 0, {
    message: "Selling price is required",
    path: ["selling_price"],
  })
  .refine((d) => !d.purchasable || d.cost_price > 0, {
    message: "Cost price is required",
    path: ["cost_price"],
  })
  .refine((d) => !(d.type === "goods" && d.track_inventory) || !!d.inventory_account, {
    message: "Inventory account is required",
    path: ["inventory_account"],
  });

type FormValues = z.infer<typeof schema>;

function NewItemPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "goods", name: "", sku: "", unit: "", hs_code: "",
      sellable: true, purchasable: true,
      selling_price: 0, cost_price: 0,
      sales_account: "", purchase_account: "", sales_vat: "", purchase_vat: "",
      sales_desc: "", purchase_desc: "", preferred_vendor: "",
      track_inventory: true, inventory_account: "", valuation: "fifo", reorder_level: 0,
    },
  });
  const { register, handleSubmit, control, watch, formState: { errors, isDirty, isSubmitting } } = form;
  const type = watch("type");
  const sellable = watch("sellable");
  const purchasable = watch("purchasable");
  const trackInventory = watch("track_inventory");

  const { data: accounts } = useQuery({
    enabled: !!tenantId,
    queryKey: ["coa", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id,name,account_type")
        .eq("tenant_id", tenantId!).eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: vatRates } = useQuery({
    enabled: !!tenantId,
    queryKey: ["tax_rates", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("tax_rates").select("id,name,rate").eq("tenant_id", tenantId!);
      return data ?? [];
    },
  });
  const { data: vendors } = useQuery({
    enabled: !!tenantId,
    queryKey: ["suppliers-min", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId!).is("deleted_at", null).order("name");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      if (!tenantId) throw new Error("No tenant selected");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not authenticated");

      // SKU uniqueness within tenant
      const sku = v.sku?.trim() || null;
      if (sku) {
        const { data: existing, error: skuErr } = await supabase
          .from("items").select("id")
          .eq("tenant_id", tenantId).eq("sku", sku).is("deleted_at", null).limit(1);
        if (skuErr) throw skuErr;
        if (existing && existing.length > 0) {
          throw new Error(`SKU "${sku}" already exists`);
        }
      }

      const itemType: "inventory" | "service" | "non_inventory" =
        v.type === "service" ? "service" : v.track_inventory ? "inventory" : "non_inventory";

      const payload = {
        tenant_id: tenantId,
        created_by: uid,
        name: v.name.trim(),
        sku,
        unit: v.unit.trim(),
        item_type: itemType,
        selling_price: v.sellable ? v.selling_price : 0,
        cost_price: v.purchasable ? v.cost_price : 0,
        reorder_level: v.reorder_level || 0,
        is_active: true,
        description:
          [v.sales_desc?.trim(), v.purchase_desc?.trim()].filter(Boolean).join("\n---\n") || null,
      };

      const { error } = await supabase.from("items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item created");
      navigate({ to: "/items" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save item"),
  });

  const onCancel = () => {
    if (isDirty && !window.confirm("Discard changes and leave this page?")) return;
    navigate({ to: "/items" });
  };

  const salesAccts = (accounts ?? []).filter((a: any) => a.account_type === "income");
  const purchaseAccts = (accounts ?? []).filter(
    (a: any) => a.account_type === "expense" || a.account_type === "cost_of_goods_sold",
  );
  const inventoryAccts = (accounts ?? []).filter((a: any) => a.account_type === "asset");

  return (
    <form
      onSubmit={handleSubmit((v) => save.mutate(v))}
      className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col bg-background"
    >
      {/* Utility bar */}
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate({ to: "/items" })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search in Items ( / )" className="h-9 pl-9 bg-muted/40 border-transparent" />
        </div>
      </div>

      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">New Item</h1>
        <Link to="/items" className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Top section */}
        <div className="bg-muted/30 px-8 py-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <Row label={<Lbl>Type</Lbl>}>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <div className="flex items-center gap-6 pt-1.5">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" checked={field.value === "goods"} onChange={() => field.onChange("goods")} className="accent-primary" />
                        Goods
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" checked={field.value === "service"} onChange={() => field.onChange("service")} className="accent-primary" />
                        Service
                      </label>
                    </div>
                  )}
                />
              </Row>
              <Row label={<Req>Name</Req>} error={errors.name?.message}>
                <Input {...register("name")} className="h-9 max-w-md" />
              </Row>
              <Row label={<Lbl>SKU</Lbl>} error={errors.sku?.message}>
                <Input {...register("sku")} className="h-9 max-w-md" />
              </Row>
              <Row label={<Req>Unit</Req>} error={errors.unit?.message}>
                <Controller
                  control={control}
                  name="unit"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9 max-w-md"><SelectValue placeholder="Select or type to add" /></SelectTrigger>
                      <SelectContent>
                        {["pcs", "box", "kg", "g", "ltr", "ml", "m", "cm", "hrs", "day"].map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Row>
              <Row label={<Lbl>HS Code</Lbl>}>
                <div className="flex max-w-md items-center gap-2">
                  <Input {...register("hs_code")} className="h-9" />
                  <Search className="h-4 w-4 text-primary" />
                </div>
              </Row>
            </div>

            <div className="flex items-start justify-center lg:justify-end">
              <div className="grid h-44 w-72 place-items-center rounded border-2 border-dashed border-border bg-card text-center">
                <div className="space-y-1.5">
                  <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Drag image(s) here or</p>
                  <button type="button" className="text-sm text-primary hover:underline">Browse images</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sales & Purchase */}
        <div className="grid grid-cols-1 gap-10 px-8 py-8 lg:grid-cols-2">
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="font-medium">Sales Information</h2>
              <Controller
                control={control}
                name="sellable"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                    Sellable
                  </label>
                )}
              />
            </div>
            <div className={cn("space-y-3", !sellable && "opacity-50 pointer-events-none")}>
              <Row label={<Req>Selling Price</Req>} error={errors.selling_price?.message}>
                <div className="flex max-w-xs items-center">
                  <span className="flex h-9 items-center rounded-l border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{currency}</span>
                  <Input {...register("selling_price")} type="number" step="0.01" min="0" className="h-9 rounded-l-none" />
                </div>
              </Row>
              <Row label={<Req>Account</Req>}>
                <Controller control={control} name="sales_account" render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="Sales" /></SelectTrigger>
                    <SelectContent>
                      {salesAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </Row>
              <Row label={<Lbl>Sales VAT Rule</Lbl>}>
                <Controller control={control} name="sales_vat" render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="" /></SelectTrigger>
                    <SelectContent>
                      {(vatRates ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name} ({v.rate}%)</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </Row>
              <Row label={<Lbl>Description</Lbl>}>
                <Textarea {...register("sales_desc")} className="max-w-xs" rows={2} />
              </Row>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="font-medium">Purchase Information</h2>
              <Controller
                control={control}
                name="purchasable"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                    Purchasable
                  </label>
                )}
              />
            </div>
            <div className={cn("space-y-3", !purchasable && "opacity-50 pointer-events-none")}>
              <Row label={<Req>Cost Price</Req>} error={errors.cost_price?.message}>
                <div className="flex max-w-xs items-center">
                  <span className="flex h-9 items-center rounded-l border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{currency}</span>
                  <Input {...register("cost_price")} type="number" step="0.01" min="0" className="h-9 rounded-l-none" />
                </div>
              </Row>
              <Row label={<Req>Account</Req>}>
                <Controller control={control} name="purchase_account" render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="Cost of Goods Sold" /></SelectTrigger>
                    <SelectContent>
                      {purchaseAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </Row>
              <Row label={<Lbl>Purchase VAT Rule</Lbl>}>
                <Controller control={control} name="purchase_vat" render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="" /></SelectTrigger>
                    <SelectContent>
                      {(vatRates ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name} ({v.rate}%)</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </Row>
              <Row label={<Lbl>Description</Lbl>}>
                <Textarea {...register("purchase_desc")} className="max-w-xs" rows={2} />
              </Row>
              <Row label={<Lbl>Preferred Vendor</Lbl>}>
                <Controller control={control} name="preferred_vendor" render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="" /></SelectTrigger>
                    <SelectContent>
                      {(vendors ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </Row>
            </div>
          </section>
        </div>

        {/* Inventory */}
        {type === "goods" && (
          <div className="border-t px-8 py-6">
            <Controller
              control={control}
              name="track_inventory"
              render={({ field }) => (
                <label className="flex items-center gap-2">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                  <span className="font-medium">Track Inventory for this item</span>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </label>
              )}
            />
            <p className="ml-6 mt-1 text-xs text-muted-foreground">
              You cannot enable/disable inventory tracking once you've created transactions for this item
            </p>

            {trackInventory && (
              <div className="ml-6 mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 max-w-3xl">
                <Row label={<Req>Inventory Account</Req>} error={errors.inventory_account?.message}>
                  <Controller control={control} name="inventory_account" render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="Select an account" /></SelectTrigger>
                      <SelectContent>
                        {inventoryAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </Row>
                <Row label={<Req>Inventory Valuation Method</Req>}>
                  <Controller control={control} name="valuation" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9 max-w-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
                        <SelectItem value="wac">Weighted Average Cost</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </Row>
                <Row label={<Lbl>Reorder Level</Lbl>} error={errors.reorder_level?.message}>
                  <Input {...register("reorder_level")} type="number" step="0.01" min="0" className="h-9 max-w-xs" />
                </Row>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t bg-card px-6 py-3">
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={isSubmitting || save.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}

function Req({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-rose-600 underline decoration-dotted underline-offset-4">
      {children}<span aria-hidden>*</span>
      <HelpCircle className="h-3 w-3 opacity-60" />
    </span>
  );
}
function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-foreground/80">
      {children}
      <HelpCircle className="h-3 w-3 opacity-50" />
    </span>
  );
}
function Row({ label, children, error }: { label: React.ReactNode; children: React.ReactNode; error?: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
      <div className="pt-2">{label}</div>
      <div>
        {children}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
