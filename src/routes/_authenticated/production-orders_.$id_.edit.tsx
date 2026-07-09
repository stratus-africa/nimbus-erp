import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production-orders_/$id_/edit")({
  head: () => ({ meta: [{ title: "Edit Production Order — Nimbus ERP" }] }),
  component: EditProductionOrderPage,
});

function EditProductionOrderPage() {
  const { id } = Route.useParams();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [assemblyItemId, setAssemblyItemId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [status, setStatus] = useState<string>("draft");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: order, isLoading } = useQuery({
    enabled: !!id,
    queryKey: ["production-order-edit", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("assembly_orders")
        .select("id, order_number, assembly_item_id, quantity, status, notes")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

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

  useEffect(() => {
    if (order) {
      setAssemblyItemId(order.assembly_item_id ?? "");
      setQuantity(Number(order.quantity ?? 1));
      setStatus(order.status ?? "draft");
      setNotes(order.notes ?? "");
    }
  }, [order]);

  const locked = order?.status === "completed" || order?.status === "cancelled";

  const options = useMemo(
    () => (assemblies ?? []).filter((a: any) => a.items?.id),
    [assemblies],
  );

  const save = async () => {
    if (!assemblyItemId) return toast.error("Select a product to produce");
    if (quantity <= 0) return toast.error("Quantity must be greater than zero");
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("assembly_orders")
        .update({
          assembly_item_id: assemblyItemId,
          quantity,
          status,
          notes: notes || null,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Production order updated");
      qc.invalidateQueries({ queryKey: ["production-order", id] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      navigate({ to: "/production-orders/$id", params: { id } });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !order) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/production-orders/$id", params: { id } })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Edit {order.order_number ?? "Production Order"}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/production-orders/$id", params: { id } })}>Cancel</Button>
          <Button disabled={saving || locked} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {locked && (
        <Card className="max-w-2xl p-4 border-amber-300 bg-amber-50 text-amber-900">
          This order is {order.status}. Fields are read-only.
        </Card>
      )}

      <Card className="max-w-2xl space-y-4 p-6">
        <div className="space-y-2">
          <Label>Product to Produce *</Label>
          <Select value={assemblyItemId} onValueChange={setAssemblyItemId} disabled={locked}>
            <SelectTrigger><SelectValue placeholder="Select an assembly-type product" /></SelectTrigger>
            <SelectContent>
              {options.map((a: any) => (
                <SelectItem key={a.items?.id} value={a.items?.id}>
                  {a.items?.name} {a.items?.sku ? `(${a.items.sku})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Quantity to Produce *</Label>
          <Input type="number" step="1" min="1" value={quantity} disabled={locked} onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Card>
    </div>
  );
}
