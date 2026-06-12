import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Search, X, Users, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCVSettings } from "@/hooks/use-cv-settings";
import { CV_SETTINGS_DEFAULTS, type CVSettings } from "@/lib/cv-settings-schema";
import { CustomizationCrudTab } from "@/components/settings/customization-crud-tab";

export const Route = createFileRoute("/_authenticated/settings_/customers-vendors")({
  head: () => ({ meta: [{ title: "Customers & Vendors Settings — Nimbus ERP" }] }),
  component: CVSettingsPage,
});

const TABS = ["General", "Field Customization", "Custom Buttons", "Related Lists"] as const;
type Tab = (typeof TABS)[number];
const ENTITY = "customers_vendors";

function CVSettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("General");
  const [query, setQuery] = useState("");

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-muted/30">
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
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => navigate({ to: "/settings" })}>
          Close Settings <X className="h-4 w-4 text-rose-500" />
        </Button>
      </div>

      <div className="bg-card">
        <div className="px-6 pt-5 pb-2 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Customers and Vendors</h1>
        </div>
        <div className="border-b px-6">
          <div className="flex gap-6 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap",
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
        <div className="max-w-4xl px-6 py-6">
          {tab === "General" && <GeneralTab />}
          {tab === "Field Customization" && (
            <CustomizationCrudTab
              title="Custom Fields"
              description="Add custom fields shown on the customer/vendor create/edit form."
              table="custom_fields"
              entity={ENTITY}
              columns={[
                { key: "label", label: "Label" },
                { key: "field_key", label: "Key" },
                { key: "data_type", label: "Type" },
                { key: "required", label: "Required", render: (r) => r.required ? "Yes" : "No" },
                { key: "is_active", label: "Active", render: (r) => r.is_active ? "Yes" : "No" },
              ]}
              fields={[
                { name: "label", label: "Label", type: "text", required: true },
                { name: "field_key", label: "Field key", type: "text", required: true, helpText: "Lowercase, no spaces." },
                { name: "data_type", label: "Data type", type: "select", required: true, options: ["text","number","date","boolean","select"] },
                { name: "required", label: "Required", type: "boolean" },
                { name: "default_value", label: "Default value", type: "text" },
                { name: "is_active", label: "Active", type: "boolean" },
              ]}
              defaultRow={{ data_type: "text", required: false, is_active: true, options: [] }}
              validate={(r) => {
                if (!r.label?.trim()) return "Label is required";
                if (!r.field_key?.trim()) return "Field key is required";
                if (!/^[a-z][a-z0-9_]*$/.test(r.field_key)) return "Field key must be lowercase letters/numbers/underscores";
                return null;
              }}
            />
          )}
          {tab === "Custom Buttons" && (
            <CustomizationCrudTab
              title="Custom Buttons"
              description="Add buttons to the customer/vendor detail or list view."
              table="custom_buttons"
              entity={ENTITY}
              columns={[
                { key: "label", label: "Label" },
                { key: "placement", label: "Placement" },
                { key: "action_type", label: "Action" },
                { key: "is_active", label: "Active", render: (r) => r.is_active ? "Yes" : "No" },
              ]}
              fields={[
                { name: "label", label: "Button label", type: "text", required: true },
                { name: "placement", label: "Placement", type: "select", required: true, options: ["detail","list","both"] },
                { name: "action_type", label: "Action type", type: "select", required: true, options: ["url","webhook","copy"] },
                { name: "action_config", label: "Action config (JSON)", type: "textarea", required: true, helpText: 'e.g. {"url":"https://example.com/{{id}}"}' },
                { name: "icon", label: "Icon name", type: "text" },
                { name: "is_active", label: "Active", type: "boolean" },
              ]}
              defaultRow={{ placement: "detail", action_type: "url", is_active: true, action_config: {} }}
              validate={(r) => {
                if (!r.label?.trim()) return "Label is required";
                try { if (typeof r.action_config === "string") r.action_config = JSON.parse(r.action_config); }
                catch { return "Action config must be valid JSON"; }
                if ((r.action_type === "url" || r.action_type === "webhook") && !r.action_config?.url) return "Requires a 'url' in config";
                return null;
              }}
            />
          )}
          {tab === "Related Lists" && (
            <CustomizationCrudTab
              title="Related Lists"
              description="Show related records on the customer/vendor detail page."
              table="related_lists"
              entity={ENTITY}
              columns={[
                { key: "label", label: "Label" },
                { key: "related_entity", label: "Related entity" },
                { key: "is_active", label: "Active", render: (r) => r.is_active ? "Yes" : "No" },
              ]}
              fields={[
                { name: "label", label: "Label", type: "text", required: true },
                { name: "related_entity", label: "Related entity", type: "select", required: true,
                  options: ["invoices","bills","sales_orders","purchase_orders","quotes","payments_received","payments_made"] },
                { name: "filter", label: "Filter (JSON)", type: "textarea", helpText: 'e.g. {"status":"open"}' },
                { name: "columns", label: "Columns (comma separated)", type: "text" },
                { name: "is_active", label: "Active", type: "boolean" },
              ]}
              defaultRow={{ is_active: true, filter: {}, columns: [] }}
              validate={(r) => {
                if (!r.label?.trim()) return "Label is required";
                if (!r.related_entity) return "Related entity is required";
                try { if (typeof r.filter === "string" && r.filter) r.filter = JSON.parse(r.filter); }
                catch { return "Filter must be valid JSON"; }
                if (typeof r.columns === "string") r.columns = r.columns.split(",").map((s: string) => s.trim()).filter(Boolean);
                return null;
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function GeneralTab() {
  const { settings, isLoading, save } = useCVSettings();
  const [draft, setDraft] = useState<CVSettings>(CV_SETTINGS_DEFAULTS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading) setDraft(settings);
  }, [isLoading, settings]);

  const set = <K extends keyof CVSettings>(k: K, v: CVSettings[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const onSave = async () => {
    try {
      await save.mutateAsync(draft);
      toast.success("Customers & Vendors settings saved");
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save settings");
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-8">
      {/* Customer & Vendor Numbers */}
      <Section
        title="Customer & Vendor Numbers"
        description="Generate customer and vendor numbers automatically. You can configure the series in which numbers are generated while creating new records."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.enableCustomerNumbers}
              onCheckedChange={(c) => set("enableCustomerNumbers", !!c)}
            />
            Enable Customer Numbers
          </label>
          {draft.enableCustomerNumbers && (
            <div className="ml-6 grid grid-cols-2 gap-3 max-w-md">
              <div>
                <Label className="text-xs">Prefix</Label>
                <Input value={draft.customerNumberPrefix} onChange={(e) => set("customerNumberPrefix", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Next number</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.customerNumberNext}
                  onChange={(e) => set("customerNumberNext", Number(e.target.value) || 1)}
                />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.enableVendorNumbers}
              onCheckedChange={(c) => set("enableVendorNumbers", !!c)}
            />
            Enable Vendor Numbers
          </label>
          {draft.enableVendorNumbers && (
            <div className="ml-6 grid grid-cols-2 gap-3 max-w-md">
              <div>
                <Label className="text-xs">Prefix</Label>
                <Input value={draft.vendorNumberPrefix} onChange={(e) => set("vendorNumberPrefix", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Next number</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.vendorNumberNext}
                  onChange={(e) => set("vendorNumberNext", Number(e.target.value) || 1)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium">Note:</div>
            <ul className="list-disc pl-5 text-muted-foreground text-xs space-y-1">
              <li>Generating these numbers may take a few minutes to a few hours, depending on the number of records that you have. The Customer and Vendor Number field will be available once this process is done.</li>
              <li>Once you've enabled this feature, you cannot disable it.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Divider />

      {/* Default Customer Type */}
      <Section
        title="Default Customer Type"
        description="Select the default customer type based on the kind of customers you usually sell your products or services to. The default customer type will be pre-selected in the customer creation form."
      >
        <RadioGroup
          value={draft.defaultCustomerType}
          onValueChange={(v) => set("defaultCustomerType", v as CVSettings["defaultCustomerType"])}
          className="space-y-2"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="business" /> Business
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="individual" /> Individual
          </label>
        </RadioGroup>
      </Section>

      <Divider />

      {/* Customer Credit Limit */}
      <Section
        title="Customer Credit Limit"
        description="Credit Limit enables you to set limit on the outstanding receivable amount of the customers."
        headerRight={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {draft.customerCreditLimitEnabled ? "Enabled" : "Disabled"}
            </span>
            <Switch
              checked={draft.customerCreditLimitEnabled}
              onCheckedChange={(c) => set("customerCreditLimitEnabled", c)}
            />
          </div>
        }
      >
        {draft.customerCreditLimitEnabled && (
          <div className="space-y-4">
            <div>
              <div className="text-sm mb-2">What do you want to do when credit limit is exceeded?</div>
              <RadioGroup
                value={draft.creditLimitExceededAction}
                onValueChange={(v) => set("creditLimitExceededAction", v as CVSettings["creditLimitExceededAction"])}
                className="space-y-2"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="restrict" /> Restrict creating or updating invoices
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="warn" /> Show a warning and allow users to proceed
                </label>
              </RadioGroup>
            </div>
            <div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={draft.includeSalesOrdersInCreditLimit}
                  onCheckedChange={(c) => set("includeSalesOrdersInCreditLimit", !!c)}
                />
                <div>
                  Include sales orders' amount in limiting the credit given to customers
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Credit Limit will not affect the creation of sales orders from marketplace and other POS integrations.
                  </div>
                </div>
              </label>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="font-medium">Note:</div>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Go to the respective customer's contact details to set the credit limit.</li>
                <li>Credit Limit will not affect recurring invoices.</li>
              </ul>
            </div>
          </div>
        )}
      </Section>

      <Divider />

      {/* Multi-currency */}
      <Section
        title="Multi-currency Transactions for Each Contact"
        description="Create sales and purchase transactions in multiple currencies for each of your customers and vendors. You can then run reports in the base and associated foreign currencies."
        headerRight={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {draft.multiCurrencyPerContact ? "Enabled" : "Disabled"}
            </span>
            <Switch
              checked={draft.multiCurrencyPerContact}
              onCheckedChange={(c) => set("multiCurrencyPerContact", c)}
            />
          </div>
        }
      />

      <div className="pt-2">
        <Button onClick={onSave} disabled={!dirty || save.isPending} className="bg-amber-500 hover:bg-amber-600 text-white">
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  headerRight,
  children,
}: {
  title: string;
  description?: string;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>}
        </div>
        {headerRight}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

function Divider() {
  return <div className="border-t" />;
}
