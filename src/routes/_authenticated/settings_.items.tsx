import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemsGeneralTab } from "@/components/settings/items-general-tab";
import { ItemsMiniList } from "@/components/settings/items-mini-list";
import { CustomizationCrudTab } from "@/components/settings/customization-crud-tab";

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

const ENTITY = "items";

function ItemsSettingsPage() {
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
          <Settings2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Items</h1>
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
        <div className="max-w-5xl px-6 py-6">
          {tab === "General" && <ItemsGeneralTab />}

          {tab === "Field Customization" && (
            <CustomizationCrudTab
              title="Custom Fields"
              description="Add custom fields shown on the item create/edit form."
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
                { name: "field_key", label: "Field key", type: "text", required: true, helpText: "Lowercase, no spaces. Used in code/API." },
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

          {tab === "Validation Rules" && (
            <CustomizationCrudTab
              title="Validation Rules"
              description="Block saves that violate these rules."
              table="validation_rules"
              entity={ENTITY}
              columns={[
                { key: "name", label: "Name" },
                { key: "field_key", label: "Field" },
                { key: "operator", label: "Operator" },
                { key: "error_message", label: "Message" },
                { key: "is_active", label: "Active", render: (r) => r.is_active ? "Yes" : "No" },
              ]}
              fields={[
                { name: "name", label: "Name", type: "text", required: true },
                { name: "field_key", label: "Field", type: "text", required: true, helpText: "e.g. selling_price, sku" },
                { name: "operator", label: "Operator", type: "select", required: true,
                  options: ["required","eq","neq","gt","lt","gte","lte","between","regex","min_length","max_length"] },
                { name: "value", label: "Value", type: "text", helpText: "JSON value or plain text/number" },
                { name: "error_message", label: "Error message", type: "textarea", required: true },
                { name: "is_active", label: "Active", type: "boolean" },
              ]}
              defaultRow={{ operator: "required", is_active: true, value: null }}
              validate={(r) => {
                if (!r.name?.trim()) return "Name is required";
                if (!r.field_key?.trim()) return "Field is required";
                if (!r.error_message?.trim()) return "Error message is required";
                if (r.value !== null && r.value !== undefined && typeof r.value === "string") {
                  try { r.value = JSON.parse(r.value); } catch { /* keep as string */ }
                }
                return null;
              }}
            />
          )}

          {tab === "Record Locking" && (
            <CustomizationCrudTab
              title="Record Locks"
              description="Lock fields on records that match a condition."
              table="record_locks"
              entity={ENTITY}
              columns={[
                { key: "name", label: "Name" },
                { key: "condition", label: "Condition", render: (r) => <code className="text-xs">{JSON.stringify(r.condition)}</code> },
                { key: "lock_fields", label: "Locked fields", render: (r) => Array.isArray(r.lock_fields) ? r.lock_fields.join(", ") : "" },
                { key: "is_active", label: "Active", render: (r) => r.is_active ? "Yes" : "No" },
              ]}
              fields={[
                { name: "name", label: "Name", type: "text", required: true },
                { name: "condition", label: "Condition (JSON)", type: "textarea", required: true, helpText: 'e.g. {"status":"archived"}' },
                { name: "lock_fields", label: "Locked fields (comma separated)", type: "text", required: true },
                { name: "roles_allowed", label: "Roles allowed to bypass (comma separated)", type: "text", helpText: "e.g. company_admin" },
                { name: "is_active", label: "Active", type: "boolean" },
              ]}
              defaultRow={{ is_active: true, condition: {}, lock_fields: [], roles_allowed: [] }}
              validate={(r) => {
                if (!r.name?.trim()) return "Name is required";
                try {
                  if (typeof r.condition === "string") r.condition = JSON.parse(r.condition);
                } catch { return "Condition must be valid JSON"; }
                if (typeof r.lock_fields === "string") r.lock_fields = r.lock_fields.split(",").map((s: string) => s.trim()).filter(Boolean);
                if (!Array.isArray(r.lock_fields) || !r.lock_fields.length) return "Add at least one locked field";
                if (typeof r.roles_allowed === "string") r.roles_allowed = r.roles_allowed.split(",").map((s: string) => s.trim()).filter(Boolean);
                return null;
              }}
            />
          )}

          {tab === "Custom Buttons" && (
            <CustomizationCrudTab
              title="Custom Buttons"
              description="Add buttons to the item detail or list view."
              table="custom_buttons"
              entity={ENTITY}
              columns={[
                { key: "label", label: "Label" },
                { key: "placement", label: "Placement" },
                { key: "action_type", label: "Action" },
                { key: "action_config", label: "Config", render: (r) => <code className="text-xs">{JSON.stringify(r.action_config)}</code> },
                { key: "is_active", label: "Active", render: (r) => r.is_active ? "Yes" : "No" },
              ]}
              fields={[
                { name: "label", label: "Button label", type: "text", required: true },
                { name: "placement", label: "Placement", type: "select", required: true, options: ["detail","list","both"] },
                { name: "action_type", label: "Action type", type: "select", required: true, options: ["url","webhook","copy"] },
                { name: "action_config", label: "Action config (JSON)", type: "textarea", required: true, helpText: 'e.g. {"url":"https://example.com/items/{{id}}"}' },
                { name: "icon", label: "Icon name", type: "text" },
                { name: "is_active", label: "Active", type: "boolean" },
              ]}
              defaultRow={{ placement: "detail", action_type: "url", is_active: true, action_config: {} }}
              validate={(r) => {
                if (!r.label?.trim()) return "Label is required";
                try { if (typeof r.action_config === "string") r.action_config = JSON.parse(r.action_config); }
                catch { return "Action config must be valid JSON"; }
                if (r.action_type === "url" && !r.action_config?.url) return "URL action requires a 'url' in config";
                if (r.action_type === "webhook" && !r.action_config?.url) return "Webhook requires a 'url' in config";
                return null;
              }}
            />
          )}

          {tab === "Related Lists" && (
            <CustomizationCrudTab
              title="Related Lists"
              description="Show related records on the item detail page."
              table="related_lists"
              entity={ENTITY}
              columns={[
                { key: "label", label: "Label" },
                { key: "related_entity", label: "Related entity" },
                { key: "filter", label: "Filter", render: (r) => <code className="text-xs">{JSON.stringify(r.filter)}</code> },
                { key: "is_active", label: "Active", render: (r) => r.is_active ? "Yes" : "No" },
              ]}
              fields={[
                { name: "label", label: "Label", type: "text", required: true },
                { name: "related_entity", label: "Related entity", type: "select", required: true,
                  options: ["invoices","bills","sales_orders","purchase_orders","quotes","inventory_adjustments"] },
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
