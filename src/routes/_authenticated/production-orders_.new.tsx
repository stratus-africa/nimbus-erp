import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Factory, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/production-orders_/new")({
  head: () => ({ meta: [{ title: "New Production Order — Nimbus ERP" }] }),
  component: NewAssemblyOrderPage,
});

// Statuses considered "not fully fulfilled" — the SO still has open lines
// that could drive production.
const OPEN_SO_STATUSES = ["draft", "confirmed", "sent", "partially_invoiced"];

type Pick = { selected: boolean; qty: number };
type PickKey = string; // `${soId}:${lineId}`

function NewAssemblyOrderPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const [mode, setMode] = useState<"manual" | "from_so">("manual");

  // Manual mode state
  const [assemblyItemId, setAssemblyItemId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // From-SO mode state
  const [soIds, setSoIds] = useState<string[]>([]);
  const [soNotes, setSoNotes] = useState("");
  const [consolidate, setConsolidate] = useState(true);
  const [picks, setPicks] = useState<Record<PickKey, Pick>>({});
  const [soPickerOpen, setSoPickerOpen] = useState(false);
  const [soSearch, setSoSearch] = useState("");

  const { data: assemblies } = useQuery({
    enabled: !!tenantId,
    queryKey: ["assembly-parents", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("composite_items")
        .select("parent_item_id, items:parent_item_id(id, name, sku)")
        .eq("tenant_id", tenantId!)
        .eq("composite_type", "assembly")
        .eq("status", "active");
      return data ?? [];
    },
  });

  const assemblyItemIds = useMemo(
    () => new Set((assemblies ?? []).map((a: any) => a.items?.id).filter(Boolean)),
    [assemblies],
  );

  const { data: openSOs } = useQuery({
    enabled: !!tenantId && mode === "from_so",
    queryKey: ["open-sales-orders", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_orders")
        .select("id, so_number, so_date, status, customers(name)")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .in("status", OPEN_SO_STATUSES)
        .order("so_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allSoLines } = useQuery({
    enabled: !!tenantId && soIds.length > 0,
    queryKey: ["so-lines-for-assembly-multi", soIds.slice().sort().join(",")],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_order_lines")
        .select("id, sales_order_id, item_id, description, quantity, position, items:item_id(id, name, sku)")
        .in("sales_order_id", soIds)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Only lines whose item is a registered assembly composite item.
  const assemblyLines = useMemo(
    () => (allSoLines ?? []).filter((l: any) => l.item_id && assemblyItemIds.has(l.item_id)),
    [allSoLines, assemblyItemIds],
  );

  const soById = useMemo(() => {
    const m = new Map<string, any>();
    (openSOs ?? []).forEach((s: any) => m.set(s.id, s));
    return m;
  }, [openSOs]);

  // Initialize per-line picks when lines load. Preserve existing selections.
  useEffect(() => {
    setPicks((prev) => {
      const next: Record<PickKey, Pick> = {};
      for (const l of assemblyLines) {
        const key: PickKey = `${l.sales_order_id}:${l.id}`;
        next[key] = prev[key] ?? { selected: true, qty: Number(l.quantity) || 1 };
      }
      return next;
    });
  }, [assemblyLines]);

  const filteredSoOptions = useMemo(() => {
    const q = soSearch.trim().toLowerCase();
    const list = openSOs ?? [];
    if (!q) return list;
    return list.filter(
      (s: any) =>
        s.so_number?.toLowerCase().includes(q) ||
        s.customers?.name?.toLowerCase().includes(q),
    );
  }, [openSOs, soSearch]);

  const toggleSo = (id: string) =>
    setSoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!tenantId || !assemblyItemId) return toast.error("Select a product to produce");
    if (quantity <= 0) return toast.error("Quantity must be greater than zero");
    setSaving(true);
    try {
      const { data: num } = await supabase.rpc("next_doc_number", { _tenant: tenantId, _doc_type: "assembly" });
      const { data, error } = await (supabase as any).from("assembly_orders").insert({
        tenant_id: tenantId,
        order_number: num,
        assembly_item_id: assemblyItemId,
        quantity,
        status: "draft",
        notes: notes || null,
      }).select("id").single();
      if (error) throw error;
      toast.success("Production order created");
      navigate({ to: "/production-orders/$id", params: { id: data.id } });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const saveFromSO = async () => {
    if (!tenantId) return;
    if (!soIds.length) return toast.error("Select at least one sales order");
    const selectedLines = assemblyLines.filter(
      (l: any) => picks[`${l.sales_order_id}:${l.id}`]?.selected && (picks[`${l.sales_order_id}:${l.id}`]?.qty ?? 0) > 0,
    );
    if (!selectedLines.length) return toast.error("Select at least one product to produce");

    setSaving(true);
    const soNumbers = Array.from(new Set(selectedLines.map((l: any) => soById.get(l.sales_order_id)?.so_number).filter(Boolean)));
    const baseNote = soNotes || `From Sales Order${soNumbers.length > 1 ? "s" : ""} ${soNumbers.join(", ")}`.trim();

    // Build production plan: consolidate by item, or one per line.
    type Plan = { assembly_item_id: string; quantity: number; note: string };
    const plans: Plan[] = [];
    if (consolidate) {
      const byItem = new Map<string, { qty: number; sources: string[] }>();
      for (const l of selectedLines) {
        const key = l.item_id as string;
        const p = picks[`${l.sales_order_id}:${l.id}`];
        const bucket = byItem.get(key) ?? { qty: 0, sources: [] };
        bucket.qty += p.qty;
        const so = soById.get(l.sales_order_id)?.so_number;
        if (so && !bucket.sources.includes(so)) bucket.sources.push(so);
        byItem.set(key, bucket);
      }
      for (const [assembly_item_id, b] of byItem) {
        plans.push({
          assembly_item_id,
          quantity: b.qty,
          note: soNotes || `From Sales Order${b.sources.length > 1 ? "s" : ""} ${b.sources.join(", ")}`,
        });
      }
    } else {
      for (const l of selectedLines) {
        const p = picks[`${l.sales_order_id}:${l.id}`];
        const so = soById.get(l.sales_order_id)?.so_number;
        plans.push({
          assembly_item_id: l.item_id,
          quantity: p.qty,
          note: soNotes || `From Sales Order ${so ?? ""}`.trim(),
        });
      }
    }

    const created: string[] = [];
    try {
      for (const plan of plans) {
        const { data: num, error: ne } = await supabase.rpc("next_doc_number", {
          _tenant: tenantId,
          _doc_type: "assembly",
        });
        if (ne) throw ne;
        const { data, error } = await (supabase as any).from("assembly_orders").insert({
          tenant_id: tenantId,
          order_number: num,
          assembly_item_id: plan.assembly_item_id,
          quantity: plan.quantity,
          status: "draft",
          notes: plan.note || baseNote,
        }).select("id").single();
        if (error) throw error;
        created.push(data.id);
      }
      toast.success(`Created ${created.length} production order${created.length === 1 ? "" : "s"}`);
      if (created.length === 1) {
        navigate({ to: "/production-orders/$id", params: { id: created[0] } });
      } else {
        navigate({ to: "/production-orders" });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create production orders");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/production-orders" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">New Production Order</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/production-orders" })}>Cancel</Button>
          {mode === "manual" ? (
            <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving…" : "Save"}
            </Button>
          ) : (
            <Button disabled={saving} onClick={saveFromSO} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving…" : "Create Production Orders"}
            </Button>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded px-3 py-1.5 text-sm ${mode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => setMode("from_so")}
          className={`rounded px-3 py-1.5 text-sm ${mode === "from_so" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          From Sales Orders
        </button>
      </div>

      {mode === "manual" ? (
        <Card className="max-w-2xl space-y-4 p-6">
          <div className="space-y-2">
            <Label>Product to Produce *</Label>
            <Select value={assemblyItemId} onValueChange={setAssemblyItemId}>
              <SelectTrigger><SelectValue placeholder="Select an assembly-type product" /></SelectTrigger>
              <SelectContent>
                {assemblies?.map((a: any) => (
                  <SelectItem key={a.items?.id} value={a.items?.id}>
                    {a.items?.name} {a.items?.sku ? `(${a.items.sku})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantity to Produce *</Label>
            <Input type="number" step="1" min="1" value={quantity} onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="max-w-3xl space-y-4 p-6">
            <div className="space-y-2">
              <Label>Sales Orders *</Label>
              <Popover open={soPickerOpen} onOpenChange={setSoPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="truncate">
                      {soIds.length === 0
                        ? "Select one or more open sales orders"
                        : `${soIds.length} sales order${soIds.length === 1 ? "" : "s"} selected`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <div className="border-b p-2">
                    <Input
                      value={soSearch}
                      onChange={(e) => setSoSearch(e.target.value)}
                      placeholder="Search by SO number or customer"
                      className="h-8"
                    />
                  </div>
                  <ScrollArea className="max-h-72">
                    {filteredSoOptions.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {openSOs?.length ? "No matches" : "No open sales orders"}
                      </div>
                    ) : (
                      <ul className="py-1">
                        {filteredSoOptions.map((s: any) => {
                          const checked = soIds.includes(s.id);
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => toggleSo(s.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                              >
                                <div className="grid h-4 w-4 place-items-center rounded border">
                                  {checked && <Check className="h-3 w-3" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">
                                    {s.so_number} · {s.customers?.name ?? "—"}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatDate(s.so_date)} · {s.status}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </ScrollArea>
                  {soIds.length > 0 && (
                    <div className="flex justify-between border-t p-2">
                      <Button variant="ghost" size="sm" onClick={() => setSoIds([])}>Clear</Button>
                      <Button size="sm" onClick={() => setSoPickerOpen(false)}>Done</Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {soIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {soIds.map((id) => {
                    const s = soById.get(id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1">
                        {s?.so_number ?? id.slice(0, 6)}
                        <button
                          type="button"
                          onClick={() => toggleSo(id)}
                          className="rounded hover:bg-background/80 px-1 text-muted-foreground"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Only sales orders that are not fully fulfilled are shown.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="consolidate"
                checked={consolidate}
                onCheckedChange={(v) => setConsolidate(!!v)}
              />
              <Label htmlFor="consolidate" className="text-sm font-normal">
                Consolidate: one production order per item, summing quantities across selected sales orders
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Notes (applied to each production order)</Label>
              <Textarea
                value={soNotes}
                onChange={(e) => setSoNotes(e.target.value)}
                placeholder="Optional — defaults to From Sales Order(s) <numbers>"
              />
            </div>
          </Card>

          {soIds.length > 0 && (
            <Card>
              <div className="flex items-center justify-between border-b p-4">
                <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold">Production items across selected sales orders</h2>
                </div>
                <Badge variant="secondary">{assemblyLines.length} line(s)</Badge>
              </div>
              {assemblyLines.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  None of the selected sales orders have line items configured as assembly-type production items.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 pl-6"></TableHead>
                      <TableHead>Sales Order</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right w-40">Quantity to Produce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assemblyLines.map((l: any) => {
                      const key: PickKey = `${l.sales_order_id}:${l.id}`;
                      const p = picks[key] ?? { selected: false, qty: 0 };
                      const so = soById.get(l.sales_order_id);
                      return (
                        <TableRow key={key}>
                          <TableCell className="pl-6">
                            <Checkbox
                              checked={p.selected}
                              onCheckedChange={(v) =>
                                setPicks((prev) => ({ ...prev, [key]: { ...p, selected: !!v } }))
                              }
                            />
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{so?.so_number ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{so?.customers?.name ?? ""}</div>
                          </TableCell>
                          <TableCell>{l.items?.name ?? l.description ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{l.items?.sku ?? ""}</TableCell>
                          <TableCell className="text-right tabular-nums">{Number(l.quantity)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step="1"
                              value={p.qty}
                              onChange={(e) =>
                                setPicks((prev) => ({
                                  ...prev,
                                  [key]: { ...p, qty: parseFloat(e.target.value) || 0 },
                                }))
                              }
                              className="ml-auto h-9 w-32 text-right tabular-nums"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
