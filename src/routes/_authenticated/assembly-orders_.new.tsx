import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assembly-orders_/new")({
  head: () => ({ meta: [{ title: "New Assembly Order — Nimbus ERP" }] }),
  component: NewAssemblyOrderPage,
});

function NewAssemblyOrderPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const [assemblyItemId, setAssemblyItemId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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

  const save = async () => {
    if (!tenantId || !assemblyItemId) return toast.error("Select an assembly item");
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
      toast.success("Assembly order created");
      navigate({ to: "/assembly-orders/$id", params: { id: data.id } });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/assembly-orders" })}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-semibold">New Assembly Order</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/assembly-orders" })}>Cancel</Button>
          <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
      <Card className="p-6 space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label>Assembly Item *</Label>
          <Select value={assemblyItemId} onValueChange={setAssemblyItemId}>
            <SelectTrigger><SelectValue placeholder="Select an assembly composite item" /></SelectTrigger>
            <SelectContent>
              {assemblies?.map((a: any) => (
                <SelectItem key={a.items?.id} value={a.items?.id}>{a.items?.name} {a.items?.sku ? `(${a.items.sku})` : ""}</SelectItem>
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
    </div>
  );
}
