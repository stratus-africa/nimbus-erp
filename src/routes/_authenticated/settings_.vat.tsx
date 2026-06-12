import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, X, Receipt, Plus, Loader2, Pencil, Trash2, Lock, UserSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useVATSettings } from "@/hooks/use-vat-settings";
import { VAT_SETTINGS_DEFAULTS, vatSettingsSchema, type VATSettings } from "@/lib/vat-settings-schema";
import { useVATRates, useVATRules, type VATRate, type VATRule } from "@/hooks/use-vat-data";

export const Route = createFileRoute("/_authenticated/settings_/vat")({
  head: () => ({ meta: [{ title: "VAT Settings — Nimbus ERP" }] }),
  component: VATSettingsPage,
});

type SidebarItem = { key: string; label: string };
const PRIMARY: SidebarItem[] = [
  { key: "rates", label: "VAT Rates" },
  { key: "settings", label: "VAT Settings" },
  { key: "withholding", label: "Withholding VAT Settings" },
];
const ADVANCED: SidebarItem[] = [{ key: "rules", label: "VAT Rules" }];

function VATSettingsPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<string>("settings");
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

      <div className="grid grid-cols-[240px_1fr] min-h-[calc(100vh-7rem)] bg-card">
        {/* Sidebar */}
        <aside className="border-r p-4">
          <div className="mb-2 flex items-center gap-2 px-2">
            <Receipt className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">VAT</span>
          </div>
          <ul className="space-y-0.5">
            {PRIMARY.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => setActive(it.key)}
                  className={cn(
                    "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                    active === it.key ? "bg-muted font-medium text-foreground" : "text-foreground/80 hover:bg-muted/60",
                  )}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-5 mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Advanced Tax Automation
          </div>
          <ul className="space-y-0.5">
            {ADVANCED.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => setActive(it.key)}
                  className={cn(
                    "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                    active === it.key ? "bg-muted font-medium text-foreground" : "text-foreground/80 hover:bg-muted/60",
                  )}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Content */}
        <section className="min-h-full">
          {active === "rates" && <RatesPanel filter={query} />}
          {active === "settings" && <SettingsPanel />}
          {active === "withholding" && <WithholdingPanel />}
          {active === "rules" && <RulesPanel filter={query} />}
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────── VAT Settings ─────────────────────────── */

function SettingsPanel() {
  const { settings, isLoading, save } = useVATSettings();
  const [form, setForm] = useState<VATSettings>(VAT_SETTINGS_DEFAULTS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => setForm(settings), [settings]);

  const set = <K extends keyof VATSettings>(k: K, v: VATSettings[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const onSave = async () => {
    setErrors({});
    const parsed = vatSettingsSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0] as string;
        if (path) errs[path] = issue.message;
      }
      setErrors(errs);
      toast.error("Please fix the highlighted fields");
      return;
    }
    try {
      await save.mutateAsync(parsed.data);
      toast.success("VAT settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    }
  };

  return (
    <PanelShell title="VAT Settings" rightSlot={<FindAccountantsLink />}>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Some of the settings cannot be edited as returns have been generated already. Please delete the existing returns to edit those settings.
      </div>

      <Row label="VAT Registration Number Label">
        <Input
          value={form.vatNumberLabel}
          onChange={(e) => set("vatNumberLabel", e.target.value)}
          className="max-w-md"
        />
      </Row>

      <Row label="VAT Registration Number" required error={errors.vatRegistrationNumber}>
        <div className="max-w-md space-y-1">
          <Input
            value={form.vatRegistrationNumber}
            onChange={(e) => set("vatRegistrationNumber", e.target.value)}
          />
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => toast.info("PIN validation is not yet integrated")}
          >
            Validate PIN
          </button>
        </div>
      </Row>

      <div className="rounded-md border bg-muted/30 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Is your business registered for VAT?</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm">{form.isVatRegistered ? "Yes" : "No"}</span>
            <Switch
              checked={form.isVatRegistered}
              onCheckedChange={(v) => set("isVatRegistered", v)}
            />
          </div>
        </div>

        {form.isVatRegistered && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-sm">International Trade</Label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.enableInternationalTrade}
                  onCheckedChange={(v) => set("enableInternationalTrade", !!v)}
                />
                Enable trade with contacts outside Kenya
              </label>
            </div>

            <Row label="VAT Registered On" required error={errors.vatRegisteredOn} compact>
              <Input
                type="date"
                value={form.vatRegisteredOn ?? ""}
                onChange={(e) => set("vatRegisteredOn", e.target.value || null)}
                className="max-w-xs"
              />
            </Row>

            <Row label="Generate First Tax Return From" required error={errors.firstReturnFrom} compact>
              <Input
                type="date"
                value={form.firstReturnFrom ?? ""}
                onChange={(e) => set("firstReturnFrom", e.target.value || null)}
                className="max-w-xs"
              />
            </Row>

            <Row label="Reporting Period" compact>
              <Select
                value={form.reportingPeriod}
                onValueChange={(v) => set("reportingPeriod", v as VATSettings["reportingPeriod"])}
              >
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </>
        )}
      </div>

      <div className="pt-3">
        <Button onClick={onSave} disabled={isLoading || save.isPending} className="bg-orange-500 hover:bg-orange-600">
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </PanelShell>
  );
}

/* ─────────────────────────── Withholding ─────────────────────────── */

function WithholdingPanel() {
  const { settings, isLoading, save } = useVATSettings();
  const [enabled, setEnabled] = useState(false);
  const [appliesTo, setAppliesTo] = useState<VATSettings["withholdingVatAppliesTo"]>("both");

  useEffect(() => {
    setEnabled(settings.withholdingVatEnabled);
    setAppliesTo(settings.withholdingVatAppliesTo);
  }, [settings]);

  const onSave = async () => {
    try {
      await save.mutateAsync({
        ...settings,
        withholdingVatEnabled: enabled,
        withholdingVatAppliesTo: appliesTo,
      });
      toast.success("Withholding VAT settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    }
  };

  return (
    <PanelShell title="Withholding VAT Settings" rightSlot={<FindAccountantsLink />}>
      <div className="flex items-center justify-between max-w-3xl">
        <Label>Withholding VAT</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm">{enabled ? "Enabled" : "Disabled"}</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Withholding VAT is the tax that is withheld by the payee. You can associate Withholding VAT with customers, vendors or both. Once you've enabled it, you'll have to enable it for the particular contact in the contact's creation or edit page.
      </p>

      {enabled && (
        <Row label="Enable Withholding VAT Settings For" required>
          <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as any)}>
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="customers">Customers</SelectItem>
              <SelectItem value="vendors">Vendors</SelectItem>
              <SelectItem value="both">Customers and Vendors</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      )}

      <div className="pt-3">
        <Button onClick={onSave} disabled={isLoading || save.isPending} className="bg-orange-500 hover:bg-orange-600">
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </PanelShell>
  );
}

/* ─────────────────────────── VAT Rates ─────────────────────────── */

function RatesPanel({ filter }: { filter: string }) {
  const { rates, isLoading, create, update, remove } = useVATRates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VATRate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "inactive" | "all">("active");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rates
      .filter((r) => (view === "active" ? r.is_active : view === "inactive" ? !r.is_active : true))
      .filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [rates, filter, view]);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (r: VATRate) => { setEditing(r); setDialogOpen(true); };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <Select value={view} onValueChange={(v) => setView(v as any)}>
          <SelectTrigger className="border-0 px-0 text-base font-semibold shadow-none focus:ring-0 w-auto gap-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active taxes</SelectItem>
            <SelectItem value="inactive">Inactive taxes</SelectItem>
            <SelectItem value="all">All taxes</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3">
          <Button className="bg-orange-500 hover:bg-orange-600 gap-2" onClick={openNew}>
            <Plus className="h-4 w-4" /> New VAT
          </Button>
          <FindAccountantsLink />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-6 py-2.5"></th>
              <th className="px-2 py-2.5 text-left font-medium">VAT Name</th>
              <th className="px-2 py-2.5 text-left font-medium">Rate (%)</th>
              <th className="px-2 py-2.5 text-left font-medium">Type</th>
              <th className="w-32 px-6 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…
              </td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">No VAT rates</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="px-6 py-2.5"></td>
                <td className="px-2 py-2.5">
                  <button onClick={() => openEdit(r)} className="text-primary hover:underline">
                    {r.name}
                  </button>
                  {r.is_default && <span className="ml-2 text-[10px] uppercase text-muted-foreground">default</span>}
                </td>
                <td className="px-2 py-2.5">{Number(r.rate).toFixed(r.rate % 1 ? 2 : 0)}</td>
                <td className="px-2 py-2.5 capitalize">{r.tax_type}</td>
                <td className="px-6 py-2.5 text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" onClick={() => setDeleteId(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSubmit={async (vals) => {
          try {
            if (editing) await update.mutateAsync({ id: editing.id, ...vals });
            else await create.mutateAsync(vals);
            toast.success(editing ? "VAT rate updated" : "VAT rate created");
            setDialogOpen(false);
          } catch (e: any) { toast.error(e?.message ?? "Failed"); }
        }}
        saving={create.isPending || update.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete VAT rate?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the rate. Existing transactions retain the historical rate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try { await remove.mutateAsync(deleteId); toast.success("Deleted"); }
                catch (e: any) { toast.error(e?.message ?? "Failed"); }
                finally { setDeleteId(null); }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RateDialog({
  open, onOpenChange, editing, onSubmit, saving,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: VATRate | null;
  onSubmit: (vals: { name: string; rate: number; tax_type: VATRate["tax_type"]; is_default: boolean; is_active?: boolean }) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [taxType, setTaxType] = useState<VATRate["tax_type"]>("both");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setRate(editing ? String(editing.rate) : "");
      setTaxType(editing?.tax_type ?? "both");
      setIsDefault(editing?.is_default ?? false);
      setIsActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit VAT Rate" : "New VAT Rate"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Rate" />
          </div>
          <div className="space-y-1.5">
            <Label>Rate (%)</Label>
            <Input type="number" step="0.001" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tax Type</Label>
            <Select value={taxType} onValueChange={(v) => setTaxType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
            Set as default VAT
          </label>
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} />
              Active
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600"
            disabled={saving || !name.trim() || rate === ""}
            onClick={() => onSubmit({
              name: name.trim(),
              rate: Number(rate),
              tax_type: taxType,
              is_default: isDefault,
              ...(editing ? { is_active: isActive } : {}),
            })}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── VAT Rules ─────────────────────────── */

function RulesPanel({ filter }: { filter: string }) {
  const { rules, isLoading, create, update, remove } = useVATRules();
  const { rates } = useVATRates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VATRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rules.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [rules, filter]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h2 className="text-base font-semibold">VAT Rules</h2>
        <div className="flex items-center gap-3">
          <Button
            className="bg-orange-500 hover:bg-orange-600 gap-2"
            onClick={() => { setEditing(null); setDialogOpen(true); }}
          >
            <Plus className="h-4 w-4" /> New VAT Rule
          </Button>
          <FindAccountantsLink />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-2.5 text-left font-medium">VAT Rule Name</th>
              <th className="px-2 py-2.5 text-left font-medium">Transaction Type</th>
              <th className="px-2 py-2.5 text-left font-medium">Rate</th>
              <th className="w-40 px-6 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…
              </td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">No VAT rules yet</td></tr>
            )}
            {filtered.map((r) => {
              const rate = rates.find((x) => x.id === r.tax_rate_id);
              return (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="px-6 py-2.5">
                    <button onClick={() => { setEditing(r); setDialogOpen(true); }} className="text-primary hover:underline">
                      {r.name}
                    </button>
                    {r.is_system && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
                    {r.is_default && <span className="ml-2 text-xs text-muted-foreground">— (Default VAT Rule)</span>}
                  </td>
                  <td className="px-2 py-2.5 capitalize">{r.transaction_type}</td>
                  <td className="px-2 py-2.5">{rate ? `${rate.name} (${Number(rate.rate).toFixed(rate.rate % 1 ? 2 : 0)}%)` : "—"}</td>
                  <td className="px-6 py-2.5 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!r.is_system && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t px-6 py-3 text-xs text-muted-foreground">
        <strong>Note:</strong> The Default VAT Rule will be applied to items in a transaction when the items or the contact don't have any VAT rule associated to them.
      </p>

      <RuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        rates={rates}
        onSubmit={async (vals) => {
          try {
            if (editing) await update.mutateAsync({ id: editing.id, ...vals });
            else await create.mutateAsync(vals);
            toast.success(editing ? "Rule updated" : "Rule created");
            setDialogOpen(false);
          } catch (e: any) { toast.error(e?.message ?? "Failed"); }
        }}
        saving={create.isPending || update.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete VAT rule?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try { await remove.mutateAsync(deleteId); toast.success("Deleted"); }
                catch (e: any) { toast.error(e?.message ?? "Failed"); }
                finally { setDeleteId(null); }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RuleDialog({
  open, onOpenChange, editing, rates, onSubmit, saving,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: VATRule | null;
  rates: VATRate[];
  onSubmit: (vals: { name: string; transaction_type: VATRule["transaction_type"]; tax_rate_id: string | null; is_default: boolean }) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [txType, setTxType] = useState<VATRule["transaction_type"]>("sales");
  const [rateId, setRateId] = useState<string | "none">("none");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setTxType(editing?.transaction_type ?? "sales");
      setRateId(editing?.tax_rate_id ?? "none");
      setIsDefault(editing?.is_default ?? false);
    }
  }, [open, editing]);

  const compatibleRates = rates.filter((r) => r.is_active && (
    txType === "sales" ? r.tax_type !== "purchase" : r.tax_type !== "sales"
  ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit VAT Rule" : "New VAT Rule"}</DialogTitle>
          <DialogDescription>Map a tax rate to either sales or purchase transactions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Rule Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={editing?.is_system} />
          </div>
          <div className="space-y-1.5">
            <Label>Transaction Type</Label>
            <Select value={txType} onValueChange={(v) => setTxType(v as any)} disabled={editing?.is_system}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="purchases">Purchases</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>VAT Rate</Label>
            <Select value={rateId} onValueChange={(v) => setRateId(v)}>
              <SelectTrigger><SelectValue placeholder="Select rate" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None (Exempt / Out of scope) —</SelectItem>
                {compatibleRates.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({Number(r.rate).toFixed(r.rate % 1 ? 2 : 0)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
            Set as default rule for this transaction type
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600"
            disabled={saving || !name.trim()}
            onClick={() => onSubmit({
              name: name.trim(),
              transaction_type: txType,
              tax_rate_id: rateId === "none" ? null : rateId,
              is_default: isDefault,
            })}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Shared bits ─────────────────────────── */

function PanelShell({
  title, rightSlot, children,
}: { title: string; rightSlot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {rightSlot}
      </div>
      <div className="max-w-3xl space-y-5 px-6 py-6">{children}</div>
    </div>
  );
}

function Row({
  label, required, error, children, compact,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[220px_1fr] items-start gap-4", compact ? "" : "")}>
      <Label className={cn("pt-2 text-sm", required && "text-rose-600")}>
        {label}{required && <span className="text-rose-600">*</span>}
      </Label>
      <div>
        {children}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}

function FindAccountantsLink() {
  return (
    <button type="button" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
      <UserSearch className="h-4 w-4" /> Find Accountants
    </button>
  );
}
