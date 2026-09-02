/**
 * Warehouse Detail Page
 *
 * Tabs: Overview · Zones · Locations · Stock
 *
 * Used by /inventory/warehouses/:id
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Save,
  Loader2,
  Warehouse,
  Layers,
  MapPin,
  Package,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_TYPES = ["Receiving", "Storage", "Picking", "Dispatch", "Quarantine", "Returns", "Custom"] as const;
const LOCATION_TYPES = ["Bin", "Rack", "Shelf", "Floor", "Pallet", "Bulk", "Staging", "Custom"] as const;

const ZONE_TYPE_COLORS: Record<string, string> = {
  Receiving:   "bg-blue-100 text-blue-700",
  Storage:     "bg-green-100 text-green-700",
  Picking:     "bg-amber-100 text-amber-700",
  Dispatch:    "bg-purple-100 text-purple-700",
  Quarantine:  "bg-red-100 text-red-700",
  Returns:     "bg-orange-100 text-orange-700",
  Custom:      "bg-muted text-muted-foreground",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const qty = (v: any) =>
  v == null ? "0" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const money = (v: any) =>
  v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldRow({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-x-4 py-1.5">
      <Label className="text-sm text-muted-foreground pt-1.5">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div>{children}</div>
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge className="bg-success/15 text-success border-0 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Active</Badge>
    : <Badge variant="secondary" className="text-xs gap-1"><XCircle className="h-3 w-3" />Inactive</Badge>;
}

// ─── Zone dialog ──────────────────────────────────────────────────────────────

interface ZoneForm {
  code: string; name: string; zone_type: string;
  description: string; is_active: boolean; sort_order: number;
}

const emptyZone: ZoneForm = { code: "", name: "", zone_type: "Storage", description: "", is_active: true, sort_order: 0 };

function ZoneDialog({
  open, onClose, warehouseId, tenantId, initial, editId,
}: {
  open: boolean; onClose: () => void;
  warehouseId: string; tenantId: string;
  initial?: ZoneForm; editId?: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ZoneForm>(initial ?? emptyZone);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof ZoneForm, v: any) => {
    setForm(p => ({ ...p, [k]: v }));
    if (errors[k]) setErrors(e => { const c = { ...e }; delete c[k]; return c; });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Code is required";
    if (!form.name.trim()) e.name = "Name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("Fix validation errors");
      const payload = { ...form, warehouse_id: warehouseId, tenant_id: tenantId };
      if (editId) {
        const { error } = await db.from("warehouse_zones").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await db.from("warehouse_zones").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Zone updated" : "Zone created");
      qc.invalidateQueries({ queryKey: ["warehouse_zones", warehouseId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit Zone" : "New Zone"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 py-2">
          <FieldRow label="Code" required>
            <Input value={form.code} onChange={e => set("code", e.target.value)}
              placeholder="STR" className={`h-8 text-sm font-mono ${errors.code ? "border-destructive" : ""}`} />
            {errors.code && <p className="text-xs text-destructive mt-0.5">{errors.code}</p>}
          </FieldRow>
          <FieldRow label="Name" required>
            <Input value={form.name} onChange={e => set("name", e.target.value)}
              placeholder="Storage" className={`h-8 text-sm ${errors.name ? "border-destructive" : ""}`} />
            {errors.name && <p className="text-xs text-destructive mt-0.5">{errors.name}</p>}
          </FieldRow>
          <FieldRow label="Type">
            <Select value={form.zone_type} onValueChange={v => set("zone_type", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{ZONE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Sort Order">
            <Input type="number" value={form.sort_order} onChange={e => set("sort_order", Number(e.target.value))}
              className="h-8 text-sm w-24" />
          </FieldRow>
          <FieldRow label="Description">
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} className="text-sm" />
          </FieldRow>
          <FieldRow label="Active">
            <Select value={String(form.is_active)} onValueChange={v => set("is_active", v === "true")}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {editId ? "Save Changes" : "Create Zone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Location dialog ──────────────────────────────────────────────────────────

interface LocationForm {
  code: string; name: string; location_type: string;
  aisle: string; rack: string; level: string; bin: string;
  max_weight_kg: string; max_volume_m3: string; max_units: string;
  is_active: boolean; sort_order: number; notes: string;
}

const emptyLocation: LocationForm = {
  code: "", name: "", location_type: "Bin",
  aisle: "", rack: "", level: "", bin: "",
  max_weight_kg: "", max_volume_m3: "", max_units: "",
  is_active: true, sort_order: 0, notes: "",
};

function LocationDialog({
  open, onClose, warehouseId, zoneId, tenantId, initial, editId,
}: {
  open: boolean; onClose: () => void;
  warehouseId: string; zoneId: string; tenantId: string;
  initial?: LocationForm; editId?: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<LocationForm>(initial ?? emptyLocation);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof LocationForm, v: any) => {
    setForm(p => ({ ...p, [k]: v }));
    if (errors[k]) setErrors(e => { const c = { ...e }; delete c[k]; return c; });
  };

  // Auto-generate code from aisle/rack/level/bin when all filled
  const autoCode = [form.aisle, form.rack, form.level, form.bin].filter(Boolean).join("-");

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Code is required";
    const numChecks: [string, string][] = [
      ["max_weight_kg", "Max weight"], ["max_volume_m3", "Max volume"], ["max_units", "Max units"],
    ];
    for (const [k, label] of numChecks) {
      const v = (form as any)[k];
      if (v !== "" && isNaN(Number(v))) e[k] = `${label} must be a number`;
      else if (v !== "" && Number(v) < 0) e[k] = `${label} cannot be negative`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("Fix validation errors");
      const toNum = (v: string) => v === "" ? null : Number(v);
      const payload = {
        code: form.code.trim(),
        name: form.name.trim() || null,
        location_type: form.location_type,
        aisle: form.aisle || null,
        rack: form.rack || null,
        level: form.level || null,
        bin: form.bin || null,
        max_weight_kg: toNum(form.max_weight_kg),
        max_volume_m3: toNum(form.max_volume_m3),
        max_units: toNum(form.max_units),
        is_active: form.is_active,
        sort_order: form.sort_order,
        notes: form.notes || null,
        warehouse_id: warehouseId,
        zone_id: zoneId,
        tenant_id: tenantId,
      };
      if (editId) {
        const { error } = await db.from("warehouse_locations").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await db.from("warehouse_locations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Location updated" : "Location created");
      qc.invalidateQueries({ queryKey: ["warehouse_locations", warehouseId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit Location" : "New Bin / Location"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 py-2">
          <p className="text-xs text-muted-foreground mb-2">
            Fill Aisle / Rack / Level / Bin to auto-generate a code, or type one manually.
          </p>
          {/* Coordinate helpers */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {(["aisle", "rack", "level", "bin"] as const).map(k => (
              <div key={k}>
                <Label className="text-xs text-muted-foreground capitalize">{k}</Label>
                <Input value={form[k]} onChange={e => {
                  set(k, e.target.value);
                  // Auto-fill code from coordinates if code hasn't been manually overridden
                  const newCoords = { ...form, [k]: e.target.value };
                  const auto = [newCoords.aisle, newCoords.rack, newCoords.level, newCoords.bin].filter(Boolean).join("-");
                  if (auto) set("code", auto);
                }} placeholder={k.charAt(0).toUpperCase()} className="h-7 text-xs font-mono mt-0.5" />
              </div>
            ))}
          </div>

          <FieldRow label="Code" required>
            <Input value={form.code} onChange={e => set("code", e.target.value)}
              placeholder="A01-01-01" className={`h-8 text-sm font-mono ${errors.code ? "border-destructive" : ""}`} />
            {errors.code && <p className="text-xs text-destructive mt-0.5">{errors.code}</p>}
          </FieldRow>
          <FieldRow label="Label">
            <Input value={form.name} onChange={e => set("name", e.target.value)}
              placeholder="Aisle A, Rack 1, Level 1, Bin 1" className="h-8 text-sm" />
          </FieldRow>
          <FieldRow label="Type">
            <Select value={form.location_type} onValueChange={v => set("location_type", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{LOCATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Active">
            <Select value={String(form.is_active)} onValueChange={v => set("is_active", v === "true")}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <Separator className="my-2" />
          <p className="text-xs font-medium text-muted-foreground">Capacity (optional)</p>
          <div className="grid grid-cols-3 gap-3">
            {(["max_weight_kg", "max_volume_m3", "max_units"] as const).map((k, i) => (
              <div key={k}>
                <Label className="text-xs text-muted-foreground">{["Max kg", "Max m³", "Max units"][i]}</Label>
                <Input type="number" step="any" value={(form as any)[k]}
                  onChange={e => set(k, e.target.value)}
                  className={`h-7 text-xs mt-0.5 ${errors[k] ? "border-destructive" : ""}`} />
                {errors[k] && <p className="text-[10px] text-destructive">{errors[k]}</p>}
              </div>
            ))}
          </div>
          <FieldRow label="Notes">
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className="text-sm" />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {editId ? "Save Changes" : "Create Location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface WarehouseDetailPageProps {
  id: string;
  backTo?: string;
  backLabel?: string;
}

export function WarehouseDetailPage({
  id,
  backTo = "/inventory/warehouses",
  backLabel = "Warehouses",
}: WarehouseDetailPageProps) {
  const isNew = id === "new";
  const { tenant, can, hasRole } = useAuth();
  const qc = useQueryClient();
  const canWrite = can(["inventory.create", "inventory.update"]) || hasRole(["tenant_admin", "super_admin"]);

  // ── Warehouse data ─────────────────────────────────────────────────────────
  const { data: wh, isLoading } = useQuery({
    queryKey: ["warehouses", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("warehouses").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // ── Zones ─────────────────────────────────────────────────────────────────
  const { data: zones = [] } = useQuery({
    queryKey: ["warehouse_zones", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("warehouse_zones")
        .select("*").eq("warehouse_id", id).is("deleted_at", null)
        .order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Locations ─────────────────────────────────────────────────────────────
  const { data: locations = [] } = useQuery({
    queryKey: ["warehouse_locations", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("warehouse_locations")
        .select("*, warehouse_zones(id, name, code, zone_type)")
        .eq("warehouse_id", id).is("deleted_at", null)
        .order("sort_order").order("code");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Stock by location ─────────────────────────────────────────────────────
  const { data: stockRows = [] } = useQuery({
    queryKey: ["warehouse_stock", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_warehouse_stock", { _warehouse_id: id });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Overview form state ────────────────────────────────────────────────────
  const [values, setValues] = useState<Record<string, any>>({
    code: "", name: "", address: "", city: "", location: "",
    country: "", manager_name: "", capacity_sqm: "", status: "Active",
  });
  const [synced, setSynced] = useState(false);
  if (wh && !synced) {
    setValues({
      code: wh.code ?? "", name: wh.name ?? "",
      address: wh.address ?? "", city: wh.city ?? "",
      location: wh.location ?? "", country: wh.country ?? "",
      manager_name: wh.manager_name ?? "",
      capacity_sqm: wh.capacity_sqm ?? "",
      status: wh.status ?? "Active",
    });
    setSynced(true);
  }
  const set = (k: string, v: any) => setValues(p => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!values.name?.trim()) throw new Error("Warehouse name is required");
      if (!tenant?.id) throw new Error("No workspace");
      const payload = {
        code: values.code || null,
        name: values.name.trim(),
        address: values.address || null,
        city: values.city || null,
        location: values.location || null,
        country: values.country || null,
        manager_name: values.manager_name || null,
        capacity_sqm: values.capacity_sqm === "" ? null : Number(values.capacity_sqm),
        status: values.status || "Active",
      };
      if (isNew) {
        const { data, error } = await db.from("warehouses")
          .insert({ ...payload, tenant_id: tenant.id }).select("id").single();
        if (error) throw error;
        return data.id as string;
      }
      const { error } = await db.from("warehouses").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success(isNew ? "Warehouse created" : "Warehouse saved");
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      setSynced(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  // ── Zone / Location dialog state ───────────────────────────────────────────
  const [zoneDialog, setZoneDialog] = useState<{ open: boolean; edit?: any }>({ open: false });
  const [locDialog, setLocDialog] = useState<{ open: boolean; zoneId?: string; edit?: any }>({ open: false });

  // ── Soft delete helpers ────────────────────────────────────────────────────
  const softDelete = async (table: string, rowId: string, invalidKey: string[]) => {
    const { error } = await db.from(table)
      .update({ deleted_at: new Date().toISOString() }).eq("id", rowId);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: invalidKey }); }
  };

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalLocations = locations.length;
  const activeLocations = locations.filter((l: any) => l.is_active).length;
  const totalZones = zones.length;
  const stockedLocations = new Set(stockRows.filter((r: any) => r.location_id).map((r: any) => r.location_id)).size;
  const totalItems = new Set(stockRows.map((r: any) => r.item_id)).size;

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild>
            <Link to={backTo as any}><ArrowLeft className="h-4 w-4 mr-1" />{backLabel}</Link>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">
              {isNew ? "New Warehouse" : (wh?.name ?? "Warehouse")}
            </h1>
            {!isNew && wh?.code && (
              <p className="text-xs text-muted-foreground font-mono">{wh.code}</p>
            )}
          </div>
          {!isNew && wh?.status && (
            <ActiveBadge active={wh.status === "Active"} />
          )}
        </div>
        {canWrite && (
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            {isNew ? "Create" : "Save"}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <div className="shrink-0 border-b px-6 bg-background">
            <TabsList className="h-10 bg-transparent p-0 gap-0">
              {[
                { value: "overview",   label: "Overview",   icon: Warehouse },
                { value: "zones",      label: "Zones",      icon: Layers    },
                { value: "locations",  label: "Locations",  icon: MapPin    },
                { value: "stock",      label: "Stock",      icon: Package   },
              ].map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-4 h-10">
                  <Icon className="h-3.5 w-3.5 mr-1.5" />{label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ═══════════════════════════════════════ TAB 1: OVERVIEW ══════════ */}
          <TabsContent value="overview" className="mt-0 flex-1 overflow-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 max-w-4xl">
              {/* Left — form */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm">Warehouse Details</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <FieldRow label="Warehouse Name" required>
                    {canWrite
                      ? <Input value={values.name} onChange={e => set("name", e.target.value)}
                          placeholder="Main Warehouse" className="h-8 text-sm" />
                      : <span className="text-sm">{values.name || "—"}</span>}
                  </FieldRow>
                  <FieldRow label="Code">
                    {canWrite
                      ? <Input value={values.code} onChange={e => set("code", e.target.value)}
                          placeholder="WH-01" className="h-8 text-sm font-mono" />
                      : <span className="text-sm font-mono">{values.code || "—"}</span>}
                  </FieldRow>
                  <FieldRow label="Status">
                    {canWrite
                      ? <Select value={values.status} onValueChange={v => set("status", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      : <ActiveBadge active={values.status === "Active"} />}
                  </FieldRow>
                  <Separator className="my-3" />
                  <p className="text-xs font-medium text-muted-foreground mb-2">Address</p>
                  <FieldRow label="Street Address">
                    {canWrite
                      ? <Input value={values.address} onChange={e => set("address", e.target.value)}
                          placeholder="123 Industrial Road" className="h-8 text-sm" />
                      : <span className="text-sm">{values.address || "—"}</span>}
                  </FieldRow>
                  <FieldRow label="City">
                    {canWrite
                      ? <Input value={values.city} onChange={e => set("city", e.target.value)}
                          placeholder="Nairobi" className="h-8 text-sm" />
                      : <span className="text-sm">{values.city || "—"}</span>}
                  </FieldRow>
                  <FieldRow label="State / Region">
                    {canWrite
                      ? <Input value={values.location} onChange={e => set("location", e.target.value)}
                          placeholder="Nairobi County" className="h-8 text-sm" />
                      : <span className="text-sm">{values.location || "—"}</span>}
                  </FieldRow>
                  <FieldRow label="Country">
                    {canWrite
                      ? <Input value={values.country} onChange={e => set("country", e.target.value)}
                          placeholder="Kenya" className="h-8 text-sm" />
                      : <span className="text-sm">{values.country || "—"}</span>}
                  </FieldRow>
                  <Separator className="my-3" />
                  <p className="text-xs font-medium text-muted-foreground mb-2">Operations</p>
                  <FieldRow label="Manager">
                    {canWrite
                      ? <Input value={values.manager_name} onChange={e => set("manager_name", e.target.value)}
                          placeholder="John Doe" className="h-8 text-sm" />
                      : <span className="text-sm">{values.manager_name || "—"}</span>}
                  </FieldRow>
                  <FieldRow label="Capacity (m²)">
                    {canWrite
                      ? <Input type="number" step="any" value={values.capacity_sqm}
                          onChange={e => set("capacity_sqm", e.target.value)}
                          placeholder="5000" className="h-8 text-sm w-32" />
                      : <span className="text-sm">{values.capacity_sqm ? `${values.capacity_sqm} m²` : "—"}</span>}
                  </FieldRow>
                </CardContent>
              </Card>

              {/* Right — summary */}
              {!isNew && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Zones",     value: totalZones },
                      { label: "Locations", value: totalLocations },
                      { label: "Active Bins",  value: activeLocations },
                      { label: "Item Lines",   value: totalItems },
                    ].map(({ label, value }) => (
                      <Card key={label}>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-2xl font-semibold tabular-nums">{value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Zone Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-1.5">
                      {zones.length === 0
                        ? <p className="text-xs text-muted-foreground">No zones yet.</p>
                        : zones.map((z: any) => (
                          <div key={z.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] rounded px-1.5 py-0.5 ${ZONE_TYPE_COLORS[z.zone_type] ?? "bg-muted text-muted-foreground"}`}>
                                {z.zone_type}
                              </span>
                              <span className="font-medium">{z.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground font-mono">
                              {locations.filter((l: any) => l.zone_id === z.id).length} bins
                            </span>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════ TAB 2: ZONES ════════════ */}
          <TabsContent value="zones" className="mt-0 flex-1 overflow-auto p-6">
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Zones divide a warehouse into logical areas (Receiving, Storage, Picking, etc.)
                </p>
                {canWrite && !isNew && (
                  <Button size="sm" variant="outline"
                    onClick={() => setZoneDialog({ open: true })}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New Zone
                  </Button>
                )}
              </div>

              <Card className="overflow-hidden p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs text-right">Bins</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                      {canWrite && <TableHead className="w-20" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zones.length === 0
                      ? <TableRow><TableCell colSpan={canWrite ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                          No zones yet.{isNew ? " Save the warehouse first." : " Click \"New Zone\" to add one."}
                        </TableCell></TableRow>
                      : zones.map((z: any) => (
                        <TableRow key={z.id}>
                          <TableCell className="font-mono text-xs">{z.code}</TableCell>
                          <TableCell className="font-medium text-sm">{z.name}</TableCell>
                          <TableCell>
                            <span className={`text-xs rounded px-1.5 py-0.5 ${ZONE_TYPE_COLORS[z.zone_type] ?? "bg-muted text-muted-foreground"}`}>
                              {z.zone_type}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {locations.filter((l: any) => l.zone_id === z.id).length}
                          </TableCell>
                          <TableCell className="text-center">
                            <ActiveBadge active={z.is_active} />
                          </TableCell>
                          {canWrite && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setZoneDialog({ open: true, edit: z })}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => softDelete("warehouse_zones", z.id, ["warehouse_zones", id])}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </Card>
            </div>

            {/* Zone dialog */}
            {zoneDialog.open && !isNew && (
              <ZoneDialog
                open={zoneDialog.open}
                onClose={() => setZoneDialog({ open: false })}
                warehouseId={id}
                tenantId={tenant?.id ?? ""}
                initial={zoneDialog.edit ? {
                  code: zoneDialog.edit.code,
                  name: zoneDialog.edit.name,
                  zone_type: zoneDialog.edit.zone_type,
                  description: zoneDialog.edit.description ?? "",
                  is_active: zoneDialog.edit.is_active,
                  sort_order: zoneDialog.edit.sort_order,
                } : undefined}
                editId={zoneDialog.edit?.id}
              />
            )}
          </TabsContent>

          {/* ═════════════════════════════════════ TAB 3: LOCATIONS ══════════ */}
          <TabsContent value="locations" className="mt-0 flex-1 overflow-auto p-6">
            <div className="max-w-5xl space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Bins and racks within zones. Stock movements reference these for bin-level traceability.
                </p>
                {canWrite && !isNew && zones.length > 0 && (
                  <Button size="sm" variant="outline"
                    onClick={() => setLocDialog({ open: true, zoneId: zones[0]?.id })}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New Location
                  </Button>
                )}
              </div>

              {/* Group by zone */}
              {zones.length === 0
                ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Create zones first before adding locations.
                  </CardContent></Card>
                : zones.map((z: any) => {
                  const zoneLocs = locations.filter((l: any) => l.zone_id === z.id);
                  return (
                    <Card key={z.id} className="overflow-hidden p-0">
                      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/20">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs rounded px-1.5 py-0.5 ${ZONE_TYPE_COLORS[z.zone_type] ?? "bg-muted text-muted-foreground"}`}>
                            {z.zone_type}
                          </span>
                          <span className="font-medium text-sm">{z.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{z.code}</span>
                        </div>
                        {canWrite && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => setLocDialog({ open: true, zoneId: z.id })}>
                            <Plus className="h-3 w-3 mr-1" /> Add Bin
                          </Button>
                        )}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/10">
                            <TableHead className="text-xs">Code</TableHead>
                            <TableHead className="text-xs">Label</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Aisle</TableHead>
                            <TableHead className="text-xs">Rack</TableHead>
                            <TableHead className="text-xs">Level</TableHead>
                            <TableHead className="text-xs">Bin</TableHead>
                            <TableHead className="text-xs text-center">Status</TableHead>
                            {canWrite && <TableHead className="w-20" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {zoneLocs.length === 0
                            ? <TableRow><TableCell colSpan={canWrite ? 9 : 8} className="py-6 text-center text-xs text-muted-foreground">
                                No locations in this zone.
                              </TableCell></TableRow>
                            : zoneLocs.map((l: any) => (
                              <TableRow key={l.id}>
                                <TableCell className="font-mono text-xs font-medium">{l.code}</TableCell>
                                <TableCell className="text-sm">{l.name || "—"}</TableCell>
                                <TableCell>
                                  <span className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                                    {l.location_type}
                                  </span>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{l.aisle || "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{l.rack || "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{l.level || "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{l.bin || "—"}</TableCell>
                                <TableCell className="text-center">
                                  <ActiveBadge active={l.is_active} />
                                </TableCell>
                                {canWrite && (
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7"
                                        onClick={() => setLocDialog({ open: true, zoneId: l.zone_id, edit: l })}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7"
                                        onClick={() => softDelete("warehouse_locations", l.id, ["warehouse_locations", id])}>
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </Card>
                  );
                })}
            </div>

            {/* Location dialog */}
            {locDialog.open && locDialog.zoneId && !isNew && (
              <LocationDialog
                open={locDialog.open}
                onClose={() => setLocDialog({ open: false })}
                warehouseId={id}
                zoneId={locDialog.zoneId}
                tenantId={tenant?.id ?? ""}
                initial={locDialog.edit ? {
                  code: locDialog.edit.code,
                  name: locDialog.edit.name ?? "",
                  location_type: locDialog.edit.location_type,
                  aisle: locDialog.edit.aisle ?? "",
                  rack: locDialog.edit.rack ?? "",
                  level: locDialog.edit.level ?? "",
                  bin: locDialog.edit.bin ?? "",
                  max_weight_kg: locDialog.edit.max_weight_kg?.toString() ?? "",
                  max_volume_m3: locDialog.edit.max_volume_m3?.toString() ?? "",
                  max_units: locDialog.edit.max_units?.toString() ?? "",
                  is_active: locDialog.edit.is_active,
                  sort_order: locDialog.edit.sort_order,
                  notes: locDialog.edit.notes ?? "",
                } : undefined}
                editId={locDialog.edit?.id}
              />
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════ TAB 4: STOCK ════════════ */}
          <TabsContent value="stock" className="mt-0 flex-1 overflow-auto p-6">
            <Card className="overflow-hidden p-0 max-w-5xl">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">
                  Stock by Location
                  <span className="ml-2 text-muted-foreground font-normal text-xs">
                    ({stockRows.length} line{stockRows.length !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Zone</TableHead>
                        <TableHead className="text-xs">Bin / Location</TableHead>
                        <TableHead className="text-xs">Item</TableHead>
                        <TableHead className="text-xs">SKU</TableHead>
                        <TableHead className="text-xs text-right">On Hand</TableHead>
                        <TableHead className="text-xs text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockRows.length === 0
                        ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            No stock recorded in this warehouse yet.
                          </TableCell></TableRow>
                        : stockRows.map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>
                              {r.zone_name
                                ? <span className={`text-xs rounded px-1.5 py-0.5 ${ZONE_TYPE_COLORS[r.zone_type] ?? "bg-muted text-muted-foreground"}`}>
                                    {r.zone_name}
                                  </span>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-medium">
                              {r.location_code ?? <span className="text-muted-foreground">Unlocated</span>}
                            </TableCell>
                            <TableCell className="text-sm font-medium">{r.item_name}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{r.item_sku ?? "—"}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              <span className={Number(r.on_hand) < 0 ? "text-destructive" : ""}>
                                {qty(r.on_hand)} {r.item_uom}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {Number(r.on_hand) <= 0
                                ? <Badge variant="destructive" className="text-xs">Out</Badge>
                                : <Badge className="bg-success/15 text-success border-0 text-xs">In Stock</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
