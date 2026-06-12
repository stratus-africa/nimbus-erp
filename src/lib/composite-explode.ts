import { supabase } from "@/integrations/supabase/client";

type DocType = "quote" | "sales_order" | "invoice";
type LineLike = { item_id: string | null; quantity: number | string };

/**
 * Recompute the composite component explosion for a document.
 * Restores previously reserved/deducted stock, then applies new reservations
 * for any composite (kit) items on the current document lines.
 */
export async function applyCompositeExplosion(
  tenantId: string,
  docType: DocType,
  docId: string,
  lines: LineLike[],
): Promise<void> {
  const payload = (lines ?? [])
    .filter((l) => l.item_id && Number(l.quantity) > 0)
    .map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity) }));

  const { error } = await (supabase as any).rpc("apply_composite_explosion", {
    _tenant: tenantId,
    _doc_type: docType,
    _doc_id: docId,
    _lines: payload,
  });
  if (error) throw error;
}

/** Release composite reservations attached to a document (delete / cancel). */
export async function clearCompositeExplosion(
  tenantId: string,
  docType: DocType,
  docId: string,
): Promise<void> {
  const { error } = await (supabase as any).rpc("clear_composite_explosion", {
    _tenant: tenantId,
    _doc_type: docType,
    _doc_id: docId,
  });
  if (error) throw error;
}
