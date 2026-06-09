import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import { ImageIcon, RefreshCw, Search, X, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/items/new")({
  head: () => ({ meta: [{ title: "New Item — Nimbus ERP" }] }),
  component: NewItemPage,
});

type ItemType = "goods" | "service";

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

function NewItemPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const navigate = useNavigate();

  const [type, setType] = useState<ItemType>("goods");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [sellable, setSellable] = useState(true);
  const [purchasable, setPurchasable] = useState(true);
  const [sellingPrice, setSellingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salesAccount, setSalesAccount] = useState<string | undefined>();
  const [purchaseAccount, setPurchaseAccount] = useState<string | undefined>();
  const [salesVat, setSalesVat] = useState<string | undefined>();
  const [purchaseVat, setPurchaseVat] = useState<string | undefined>();
  const [salesDesc, setSalesDesc] = useState("");
  const [purchaseDesc, setPurchaseDesc] = useState("");
  const [preferredVendor, setPreferredVendor] = useState<string | undefined>();
  const [trackInventory, setTrackInventory] = useState(true);
  const [inventoryAccount, setInventoryAccount] = useState<string | undefined>();
  const [valuation, setValuation] = useState("fifo");
  const [reorderLevel, setReorderLevel] = useState("");

  const { data: accounts } = useQuery({
    enabled: !!tenantId,
    queryKey: ["coa", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id,name,account_type")
        .eq("tenant_id", tenantId!).eq("is_active", true)
        .order("name");
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
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const payload: any = {
        tenant_id: tenantId!,
        name: name.trim(),
        sku: sku.trim() || null,
        unit: unit.trim() || null,
        item_type: type === "service" ? "service" : trackInventory ? "inventory" : "non_inventory",
        selling_price: sellable ? parseFloat(sellingPrice || "0") : 0,
        cost_price: purchasable ? parseFloat(costPrice || "0") : 0,
        reorder_level: parseFloat(reorderLevel || "0"),
        description: [salesDesc, purchaseDesc].filter(Boolean).join("\n---\n") || null,
      };
      const { error } = await supabase.from("items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item created");
      navigate({ to: "/items" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const salesAccts = (accounts ?? []).filter((a: any) => a.account_type === "income");
  const purchaseAccts = (accounts ?? []).filter((a: any) => a.account_type === "expense" || a.account_type === "cost_of_goods_sold");
  const inventoryAccts = (accounts ?? []).filter((a: any) => a.account_type === "asset");

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col bg-background">
      {/* Utility bar */}
      <div className="flex items-center gap-3 border-b bg-card px-6 py-2.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate({ to: "/items" })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search in Items ( / )" className="h-9 pl-9 bg-muted/40 border-transparent" />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">New Item</h1>
        <Link to="/items" className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </Link>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto">
        {/* Top section */}
        <div className="bg-muted/30 px-8 py-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <Row label={<Lbl>Type</Lbl>}>
                <div className="flex items-center gap-6 pt-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={type === "goods"} onChange={() => setType("goods")} className="accent-primary" />
                    Goods
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={type === "service"} onChange={() => setType("service")} className="accent-primary" />
                    Service
                  </label>
                </div>
              </Row>
              <Row label={<Req>Name</Req>}>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 max-w-md" />
              </Row>
              <Row label={<Lbl>SKU</Lbl>}>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} className="h-9 max-w-md" />
              </Row>
              <Row label={<Lbl>Unit</Lbl>}>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="h-9 max-w-md"><SelectValue placeholder="Select or type to add" /></SelectTrigger>
                  <SelectContent>
                    {["pcs", "box", "kg", "g", "ltr", "ml", "m", "cm", "hrs", "day"].map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={<Lbl>HS Code</Lbl>}>
                <div className="flex max-w-md items-center gap-2">
                  <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} className="h-9" />
                  <Search className="h-4 w-4 text-primary" />
                </div>
              </Row>
            </div>

            {/* Image dropzone */}
            <div className="flex items-start justify-center lg:justify-end">
              <div className="grid h-44 w-72 place-items-center rounded border-2 border-dashed border-border bg-card text-center">
                <div className="space-y-1.5">
                  <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Drag image(s) here or</p>
                  <button className="text-sm text-primary hover:underline">Browse images</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sales & Purchase */}
        <div className="grid grid-cols-1 gap-10 px-8 py-8 lg:grid-cols-2">
          {/* Sales */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="font-medium">Sales Information</h2>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={sellable} onCheckedChange={(v) => setSellable(!!v)} />
                Sellable
              </label>
            </div>
            <div className={sellable ? "space-y-3" : "space-y-3 opacity-50 pointer-events-none"}>
              <Row label={<Req>Selling Price</Req>}>
                <div className="flex max-w-xs items-center">
                  <span className="flex h-9 items-center rounded-l border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{currency}</span>
                  <Input value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} type="number" step="0.01" className="h-9 rounded-l-none" />
                </div>
              </Row>
              <Row label={<Req>Account</Req>}>
                <Select value={salesAccount} onValueChange={setSalesAccount}>
                  <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="Sales" /></SelectTrigger>
                  <SelectContent>
                    {salesAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={<Lbl>Sales VAT Rule</Lbl>}>
                <Select value={salesVat} onValueChange={setSalesVat}>
                  <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="" /></SelectTrigger>
                  <SelectContent>
                    {(vatRates ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name} ({v.rate}%)</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={<Lbl>Description</Lbl>}>
                <Textarea value={salesDesc} onChange={(e) => setSalesDesc(e.target.value)} className="max-w-xs" rows={2} />
              </Row>
            </div>
          </section>

          {/* Purchase */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="font-medium">Purchase Information</h2>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={purchasable} onCheckedChange={(v) => setPurchasable(!!v)} />
                Purchasable
              </label>
            </div>
            <div className={purchasable ? "space-y-3" : "space-y-3 opacity-50 pointer-events-none"}>
              <Row label={<Req>Cost Price</Req>}>
                <div className="flex max-w-xs items-center">
                  <span className="flex h-9 items-center rounded-l border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{currency}</span>
                  <Input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} type="number" step="0.01" className="h-9 rounded-l-none" />
                </div>
              </Row>
              <Row label={<Req>Account</Req>}>
                <Select value={purchaseAccount} onValueChange={setPurchaseAccount}>
                  <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="Cost of Goods Sold" /></SelectTrigger>
                  <SelectContent>
                    {purchaseAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={<Lbl>Purchase VAT Rule</Lbl>}>
                <Select value={purchaseVat} onValueChange={setPurchaseVat}>
                  <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="" /></SelectTrigger>
                  <SelectContent>
                    {(vatRates ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name} ({v.rate}%)</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={<Lbl>Description</Lbl>}>
                <Textarea value={purchaseDesc} onChange={(e) => setPurchaseDesc(e.target.value)} className="max-w-xs" rows={2} />
              </Row>
              <Row label={<Lbl>Preferred Vendor</Lbl>}>
                <Select value={preferredVendor} onValueChange={setPreferredVendor}>
                  <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="" /></SelectTrigger>
                  <SelectContent>
                    {(vendors ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
            </div>
          </section>
        </div>

        {/* Inventory tracking */}
        {type === "goods" && (
          <div className="border-t px-8 py-6">
            <label className="flex items-center gap-2">
              <Checkbox checked={trackInventory} onCheckedChange={(v) => setTrackInventory(!!v)} />
              <span className="font-medium">Track Inventory for this item</span>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </label>
            <p className="ml-6 mt-1 text-xs text-muted-foreground">
              You cannot enable/disable inventory tracking once you've created transactions for this item
            </p>

            {trackInventory && (
              <div className="ml-6 mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 max-w-3xl">
                <Row label={<Req>Inventory Account</Req>}>
                  <Select value={inventoryAccount} onValueChange={setInventoryAccount}>
                    <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="Select an account" /></SelectTrigger>
                    <SelectContent>
                      {inventoryAccts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Row>
                <Row label={<Req>Inventory Valuation Method</Req>}>
                  <Select value={valuation} onValueChange={setValuation}>
                    <SelectTrigger className="h-9 max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
                      <SelectItem value="wac">Weighted Average Cost</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
                <Row label={<Lbl>Reorder Level</Lbl>}>
                  <Input value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} type="number" className="h-9 max-w-xs" />
                </Row>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-card px-6 py-3">
        <div className="flex gap-2">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" onClick={() => navigate({ to: "/items" })}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
      <div className="pt-2">{label}</div>
      <div>{children}</div>
    </div>
  );
}
