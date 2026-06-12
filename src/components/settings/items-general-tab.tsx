import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Info, AlertTriangle, Settings2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useItemsSettings } from "@/hooks/use-items-settings";
import {
  itemsSettingsSchema, ITEMS_SETTINGS_DEFAULTS, VALUATION_METHODS,
  type ItemsSettings,
} from "@/lib/items-settings-schema";

export function ItemsGeneralTab() {
  const { settings, isLoading, hasTrackedItems, save } = useItemsSettings();
  const [form, setForm] = useState<ItemsSettings>(ITEMS_SETTINGS_DEFAULTS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { setForm(settings); }, [settings]);

  const set = <K extends keyof ItemsSettings>(k: K, v: ItemsSettings[K]) => {
    setForm((p) => {
      const next = { ...p, [k]: v };
      // Cascade rules client-side too
      if (k === "inventoryTracking") {
        next.valuationMethod = v ? "FIFO (First In, First Out)" : "none";
      }
      if (k === "batchTracking" && !v) {
        next.allowDupBatch = false;
        next.returnsSoldBatch = false;
        next.batchSellingPrice = false;
      }
      return next;
    });
  };

  const onSave = async () => {
    const parsed = itemsSettingsSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync(parsed.data);
      toast.success("Items settings saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    }
  };

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const valuationLocked = hasTrackedItems;

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-3">
        <Row label="Set a decimal rate for your item quantity">
          <SmallSelect value={form.decimals} onChange={(v) => set("decimals", v as any)} options={["0", "2", "3", "4"]} />
        </Row>
        <Row label="Measure item dimensions in:">
          <SmallSelect value={form.dimensionUnit} onChange={(v) => set("dimensionUnit", v as any)} options={["cm", "in", "m", "ft"]} />
        </Row>
        <Row label="Measure item weights in:">
          <SmallSelect value={form.weightUnit} onChange={(v) => set("weightUnit", v as any)} options={["kg", "g", "lb", "oz"]} />
        </Row>
        <Row
          label={<span className="inline-flex items-center gap-1">Select items when barcodes are scanned using: <Info className="h-3.5 w-3.5 text-muted-foreground" /></span>}
        >
          <SmallSelect value={form.barcodeField} onChange={(v) => set("barcodeField", v as any)} options={["SKU", "Barcode", "Item Name"]} />
        </Row>
      </div>

      <Divider />

      <section>
        <h2 className="font-semibold mb-1">Default Inventory Valuation Method</h2>
        <p className="text-xs text-muted-foreground mb-3">
          This valuation method will be used by default when creating items, variants and composite items.
        </p>
        <Row label="Inventory Valuation Method">
          <div className="space-y-1">
            <Select
              value={form.valuationMethod}
              onValueChange={(v) => set("valuationMethod", v as any)}
              disabled={!form.inventoryTracking || valuationLocked}
            >
              <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VALUATION_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m === "none" ? "N/A (tracking off)" : m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.valuationMethod && <p className="text-xs text-rose-500">{errors.valuationMethod}</p>}
            {valuationLocked && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> Locked because tracked inventory items already exist.
              </p>
            )}
          </div>
        </Row>
      </section>

      <Divider />

      <section>
        <h2 className="font-semibold mb-2">Duplicate Item Name</h2>
        <CheckRow checked={form.allowDuplicateNames} onChange={(v) => set("allowDuplicateNames", v)} label="Allow duplicate item names" />
        <p className="ml-6 text-xs text-muted-foreground">
          If you allow duplicate item names, all imports involving items will use SKU as the primary field for mapping.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
          <span>Before you enable this option, make <a className="text-primary underline">the SKU field active and mandatory.</a></span>
        </div>
      </section>

      <Divider />

      <section>
        <h2 className="font-semibold mb-2">Enhanced Item Search</h2>
        <CheckRow checked={form.enhancedSearch} onChange={(v) => set("enhancedSearch", v)} label="Enable Enhanced Item Search" />
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs">
          <Info className="h-4 w-4 text-amber-600 mt-0.5" />
          <span>Enabling this option makes it easier to find any item using relevant keywords in any order.</span>
        </div>
      </section>

      <Divider />

      <section>
        <h2 className="font-semibold mb-2">HS Code</h2>
        <CheckRow checked={form.hsCodes} onChange={(v) => set("hsCodes", v)} label="Enable HS Codes for Item" />
      </section>

      <Divider />

      <section>
        <h2 className="font-semibold mb-1 inline-flex items-center gap-1">Price Lists <Info className="h-3.5 w-3.5 text-primary" /></h2>
        <CheckRow checked={form.priceLists} onChange={(v) => set("priceLists", v)} label="Enable Price Lists" />
        <p className="ml-6 text-xs text-muted-foreground">
          Price Lists enables you to customise the rates of the items in your sales and purchase transactions.
        </p>
        {form.priceLists && (
          <div className="mt-3 ml-6 rounded-md border bg-muted/30 p-3">
            <CheckRow checked={form.priceListLineLevel} onChange={(v) => set("priceListLineLevel", v)} label="Apply price list at line item level" />
            <p className="ml-6 text-xs text-muted-foreground">
              Select this option if you want to apply different price lists for each line item.
            </p>
          </div>
        )}
      </section>

      <Divider />

      <section>
        <h2 className="font-semibold mb-2">Composite Items</h2>
        <CheckRow checked={form.compositeItems} onChange={(v) => set("compositeItems", v)} label="Enable Composite Items" />
      </section>

      <Divider />

      <section>
        <h2 className="font-semibold mb-2">Inventory</h2>
        <CheckRow checked={form.inventoryTracking} onChange={(v) => set("inventoryTracking", v)} label="Enable Inventory Tracking" />
        {form.inventoryTracking && (
          <div className="ml-6 mt-2 text-xs flex items-center gap-2">
            <span className="text-rose-500 font-medium">Inventory Start Date*</span>
            <Input
              type="date"
              value={form.inventoryStartDate}
              onChange={(e) => set("inventoryStartDate", e.target.value)}
              className="h-7 w-40"
            />
          </div>
        )}
      </section>

      <Divider />

      <section>
        <h2 className="font-semibold mb-2">Advanced Inventory Tracking</h2>
        <CheckRow checked={form.serialTracking} onChange={(v) => set("serialTracking", v)} label="Enable Serial Number Tracking" />
        <CheckRow checked={form.batchTracking} onChange={(v) => set("batchTracking", v)} label="Enable Batch Tracking" />
        {form.batchTracking && (
          <div className="ml-6 mt-1 space-y-1.5 border-l-2 border-muted pl-4">
            <CheckRow checked={form.allowDupBatch} onChange={(v) => set("allowDupBatch", v)} label="Allow duplicate batch numbers" />
            <CheckRow checked={form.returnsSoldBatch} onChange={(v) => set("returnsSoldBatch", v)} label="Allow returns only to the sold batch" />
            <CheckRow checked={form.batchSellingPrice} onChange={(v) => set("batchSellingPrice", v)} label="Allow different Selling price for each Batch Tracked Items" />
          </div>
        )}
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900 p-4 grid grid-cols-3 gap-4 text-xs">
          <div><div className="text-muted-foreground">Tracked in:</div><div className="font-medium mt-0.5">Invoices, Bills & Credit Notes</div></div>
          <div><div className="text-muted-foreground">Mandatory?</div><div className="font-medium mt-0.5">No</div></div>
          <div className="text-right"><button type="button" className="text-primary inline-flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" /> Configure</button></div>
        </div>
      </section>

      <Divider />

      <section className="space-y-2">
        <CheckRow checked={form.preventNegativeStock} onChange={(v) => set("preventNegativeStock", v)} label="Prevent stock from going below zero" />
        {form.preventNegativeStock && (
          <RadioGroup value={form.stockLevel} onValueChange={(v) => set("stockLevel", v as any)} className="ml-6 space-y-1">
            <div className="flex items-center gap-2">
              <RadioGroupItem id="branch" value="branch" />
              <Label htmlFor="branch" className="font-normal inline-flex items-center gap-1">Branch level <Info className="h-3 w-3 text-muted-foreground" /></Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="warehouse" value="warehouse" />
              <Label htmlFor="warehouse" className="font-normal inline-flex items-center gap-1">Warehouse level <Info className="h-3 w-3 text-muted-foreground" /></Label>
            </div>
          </RadioGroup>
        )}
        <CheckRow checked={form.outOfStockWarn} onChange={(v) => set("outOfStockWarn", v)} label={<>Show an Out of Stock warning when an item's stock drops below zero <Info className="inline h-3 w-3 text-muted-foreground ml-1" /></>} />
        <CheckRow checked={form.reorderNotify} onChange={(v) => set("reorderNotify", v)} label="Notify me if an item's quantity reaches the reorder point" />
        {form.reorderNotify && (
          <div className="ml-6 mt-1 max-w-xs">
            <Label className="text-xs"><span className="text-rose-500">Notify to*</span></Label>
            <Input value={form.notifyEmail} onChange={(e) => set("notifyEmail", e.target.value)} className="h-8 mt-1" placeholder="name@company.com" />
            {errors.notifyEmail && <p className="text-xs text-rose-500 mt-1">{errors.notifyEmail}</p>}
          </div>
        )}
        <CheckRow checked={form.trackLandedCost} onChange={(v) => set("trackLandedCost", v)} label="Track landed cost on items" />
      </section>

      <Divider />

      <section className="flex items-center justify-between">
        <h2 className="font-semibold">Replenishments</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{form.replenishments ? "Enabled" : "Disabled"}</span>
          <Switch checked={form.replenishments} onCheckedChange={(v) => set("replenishments", v)} />
        </div>
      </section>

      <div className="pt-4">
        <Button onClick={onSave} disabled={save.isPending} className="bg-orange-500 hover:bg-orange-600 text-white">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[280px_1fr] items-center gap-4">
      <div className="text-foreground/80">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function SmallSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer py-0.5">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5" />
      <span className="text-foreground/90">{label}</span>
    </label>
  );
}

function Divider() {
  return <div className="border-t" />;
}
