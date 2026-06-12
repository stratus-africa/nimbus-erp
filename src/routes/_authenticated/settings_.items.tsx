import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Search, X, Info, AlertTriangle, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/items")({
  head: () => ({ meta: [{ title: "Items Settings — Nimbus ERP" }] }),
  component: ItemsSettingsPage,
});

const TABS = [
  "General",
  "Field Customization",
  "Validation Rules",
  "Record Locking",
  "Custom Buttons",
  "Related Lists",
] as const;
type Tab = (typeof TABS)[number];

function ItemsSettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("General");
  const [query, setQuery] = useState("");

  // Form state — UI only
  const [decimals, setDecimals] = useState("2");
  const [dimensionUnit, setDimensionUnit] = useState("cm");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [barcodeField, setBarcodeField] = useState("SKU");
  const [valuationMethod, setValuationMethod] = useState("FIFO (First In, First Out)");
  const [allowDuplicateNames, setAllowDuplicateNames] = useState(false);
  const [enhancedSearch, setEnhancedSearch] = useState(false);
  const [hsCodes, setHsCodes] = useState(true);
  const [priceLists, setPriceLists] = useState(true);
  const [priceListLineLevel, setPriceListLineLevel] = useState(false);
  const [compositeItems, setCompositeItems] = useState(true);
  const [inventoryTracking, setInventoryTracking] = useState(true);
  const [serialTracking, setSerialTracking] = useState(false);
  const [batchTracking, setBatchTracking] = useState(true);
  const [allowDupBatch, setAllowDupBatch] = useState(true);
  const [returnsSoldBatch, setReturnsSoldBatch] = useState(false);
  const [batchSellingPrice, setBatchSellingPrice] = useState(false);
  const [preventNegativeStock, setPreventNegativeStock] = useState(true);
  const [stockLevel, setStockLevel] = useState<"branch" | "warehouse">("branch");
  const [outOfStockWarn, setOutOfStockWarn] = useState(true);
  const [reorderNotify, setReorderNotify] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState("procure@organix-agro.com");
  const [trackLandedCost, setTrackLandedCost] = useState(true);
  const [replenishments, setReplenishments] = useState(false);

  const handleSave = () => {
    toast.success("Items settings saved");
  };

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-muted/30">
      {/* Top bar */}
      <div className="flex items-center gap-4 border-b bg-card px-6 py-3">
        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings ( / )"
              className="h-10 pl-9 border-primary/30 focus-visible:border-primary"
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2"
          onClick={() => navigate({ to: "/settings" })}
        >
          Close Settings <X className="h-4 w-4 text-rose-500" />
        </Button>
      </div>

      <div className="bg-card">
        <div className="px-6 pt-5 pb-2 flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Items</h1>
        </div>

        {/* Tabs */}
        <div className="border-b px-6">
          <div className="flex gap-6">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "py-2.5 text-sm border-b-2 -mb-px transition-colors",
                  tab === t
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card">
        <div className="max-w-4xl px-6 py-6 space-y-6 text-sm">
          {tab !== "General" ? (
            <div className="rounded-md border bg-muted/30 p-12 text-center text-muted-foreground">
              {tab} — coming soon.
            </div>
          ) : (
            <>
              {/* Top fields */}
              <div className="space-y-3">
                <Row label="Set a decimal rate for your item quantity">
                  <SmallSelect value={decimals} onChange={setDecimals} options={["0", "2", "3", "4"]} />
                </Row>
                <Row label="Measure item dimensions in:">
                  <SmallSelect value={dimensionUnit} onChange={setDimensionUnit} options={["cm", "in", "m", "ft"]} />
                </Row>
                <Row label="Measure item weights in:">
                  <SmallSelect value={weightUnit} onChange={setWeightUnit} options={["kg", "g", "lb", "oz"]} />
                </Row>
                <Row
                  label={
                    <span className="inline-flex items-center gap-1">
                      Select items when barcodes are scanned using:
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  }
                >
                  <SmallSelect value={barcodeField} onChange={setBarcodeField} options={["SKU", "Barcode", "Item Name"]} />
                </Row>
              </div>

              <Divider />

              <section>
                <h2 className="font-semibold mb-1">Default Inventory Valuation Method</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  This valuation method will be used by default when creating items, variants and composite items.
                </p>
                <Row label="Inventory Valuation Method">
                  <Select value={valuationMethod} onValueChange={setValuationMethod}>
                    <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIFO (First In, First Out)">FIFO (First In, First Out)</SelectItem>
                      <SelectItem value="LIFO (Last In, First Out)">LIFO (Last In, First Out)</SelectItem>
                      <SelectItem value="Weighted Average">Weighted Average</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
              </section>

              <Divider />

              <section>
                <h2 className="font-semibold mb-2">Duplicate Item Name</h2>
                <CheckRow checked={allowDuplicateNames} onChange={setAllowDuplicateNames} label="Allow duplicate item names" />
                <p className="ml-6 text-xs text-muted-foreground">
                  If you allow duplicate item names, all imports involving items will use SKU as the primary field for mapping.
                </p>
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <span>
                    Before you enable this option, make{" "}
                    <a className="text-primary underline">the SKU field active and mandatory.</a>
                  </span>
                </div>
              </section>

              <Divider />

              <section>
                <h2 className="font-semibold mb-2">Enhanced Item Search</h2>
                <CheckRow checked={enhancedSearch} onChange={setEnhancedSearch} label="Enable Enhanced Item Search" />
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs">
                  <Info className="h-4 w-4 text-amber-600 mt-0.5" />
                  <span>Enabling this option makes it easier to find any item using relevant keywords in any order.</span>
                </div>
              </section>

              <Divider />

              <section>
                <h2 className="font-semibold mb-2">HS Code</h2>
                <CheckRow checked={hsCodes} onChange={setHsCodes} label="Enable HS Codes for Item" />
              </section>

              <Divider />

              <section>
                <h2 className="font-semibold mb-1 inline-flex items-center gap-1">
                  Price Lists <Info className="h-3.5 w-3.5 text-primary" />
                </h2>
                <CheckRow checked={priceLists} onChange={setPriceLists} label="Enable Price Lists" />
                <p className="ml-6 text-xs text-muted-foreground">
                  Price Lists enables you to customise the rates of the items in your sales and purchase transactions.
                </p>
                {priceLists && (
                  <div className="mt-3 ml-6 rounded-md border bg-muted/30 p-3">
                    <CheckRow checked={priceListLineLevel} onChange={setPriceListLineLevel} label="Apply price list at line item level" />
                    <p className="ml-6 text-xs text-muted-foreground">
                      Select this option if you want to apply different price lists for each line item.
                    </p>
                  </div>
                )}
              </section>

              <Divider />

              <section>
                <h2 className="font-semibold mb-2">Composite Items</h2>
                <CheckRow checked={compositeItems} onChange={setCompositeItems} label="Enable Composite Items" />
              </section>

              <Divider />

              <section>
                <h2 className="font-semibold mb-2">Inventory</h2>
                <CheckRow checked={inventoryTracking} onChange={setInventoryTracking} label="Enable Inventory Tracking" />
                {inventoryTracking && (
                  <div className="ml-6 mt-2 text-xs">
                    <span className="text-rose-500 font-medium">Inventory Start Date*</span>
                    <Info className="inline h-3 w-3 ml-1 text-muted-foreground" />
                    {" : "}
                    <span>30 Jun 2022</span>{" "}
                    <button type="button" className="text-primary underline">Change</button>
                  </div>
                )}
              </section>

              <Divider />

              <section>
                <h2 className="font-semibold mb-2">Advanced Inventory Tracking</h2>
                <CheckRow checked={serialTracking} onChange={setSerialTracking} label="Enable Serial Number Tracking" />
                <CheckRow checked={batchTracking} onChange={setBatchTracking} label="Enable Batch Tracking" />
                {batchTracking && (
                  <div className="ml-6 mt-1 space-y-1.5 border-l-2 border-muted pl-4">
                    <CheckRow checked={allowDupBatch} onChange={setAllowDupBatch} label="Allow duplicate batch numbers" />
                    <CheckRow checked={returnsSoldBatch} onChange={setReturnsSoldBatch} label="Allow returns only to the sold batch" />
                    <CheckRow checked={batchSellingPrice} onChange={setBatchSellingPrice} label="Allow different Selling price for each Batch Tracked Items" />
                  </div>
                )}
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900 p-4 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">Tracked in:</div>
                    <div className="font-medium mt-0.5">Invoices, Bills & Credit Notes</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Mandatory?</div>
                    <div className="font-medium mt-0.5">No</div>
                  </div>
                  <div className="text-right">
                    <button type="button" className="text-primary inline-flex items-center gap-1">
                      <Settings2 className="h-3.5 w-3.5" /> Configure
                    </button>
                  </div>
                </div>
              </section>

              <Divider />

              <section className="space-y-2">
                <CheckRow checked={preventNegativeStock} onChange={setPreventNegativeStock} label="Prevent stock from going below zero" />
                {preventNegativeStock && (
                  <RadioGroup
                    value={stockLevel}
                    onValueChange={(v) => setStockLevel(v as "branch" | "warehouse")}
                    className="ml-6 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="branch" value="branch" />
                      <Label htmlFor="branch" className="font-normal inline-flex items-center gap-1">
                        Branch level <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="warehouse" value="warehouse" />
                      <Label htmlFor="warehouse" className="font-normal inline-flex items-center gap-1">
                        Warehouse level <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </div>
                  </RadioGroup>
                )}
                <CheckRow checked={outOfStockWarn} onChange={setOutOfStockWarn} label={<>Show an Out of Stock warning when an item's stock drops below zero <Info className="inline h-3 w-3 text-muted-foreground ml-1" /></>} />
                <CheckRow checked={reorderNotify} onChange={setReorderNotify} label="Notify me if an item's quantity reaches the reorder point" />
                {reorderNotify && (
                  <div className="ml-6 mt-1 max-w-xs">
                    <Label className="text-xs"><span className="text-rose-500">Notify to*</span></Label>
                    <Input
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      className="h-8 mt-1"
                    />
                  </div>
                )}
                <CheckRow checked={trackLandedCost} onChange={setTrackLandedCost} label="Track landed cost on items" />
              </section>

              <Divider />

              <section className="flex items-center justify-between">
                <h2 className="font-semibold">Replenishments</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{replenishments ? "Enabled" : "Disabled"}</span>
                  <Switch checked={replenishments} onCheckedChange={setReplenishments} />
                </div>
              </section>

              <div className="pt-4">
                <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600 text-white">
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
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

function SmallSelect({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CheckRow({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
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
