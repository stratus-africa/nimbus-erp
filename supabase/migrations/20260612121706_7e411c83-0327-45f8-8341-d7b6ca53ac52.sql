
-- Track component reservations/deductions from composite parents on docs
CREATE TABLE IF NOT EXISTS public.composite_explosions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('quote','sales_order','invoice')),
  doc_id UUID NOT NULL,
  parent_item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  component_item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_composite_explosions_doc ON public.composite_explosions(doc_type, doc_id);
CREATE INDEX IF NOT EXISTS idx_composite_explosions_tenant ON public.composite_explosions(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.composite_explosions TO authenticated;
GRANT ALL ON public.composite_explosions TO service_role;

ALTER TABLE public.composite_explosions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "composite_explosions_tenant" ON public.composite_explosions
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- Apply or recompute composite explosion for a document.
-- _lines is a jsonb array: [{ "item_id": "...", "quantity": 1 }, ...]
CREATE OR REPLACE FUNCTION public.apply_composite_explosion(
  _tenant UUID, _doc_type TEXT, _doc_id UUID, _lines JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD; l JSONB; v_comp RECORD; v_qty NUMERIC;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant) THEN
    RAISE EXCEPTION 'Not a tenant member';
  END IF;

  -- Reverse any previous explosions for this doc
  FOR r IN SELECT component_item_id, quantity FROM public.composite_explosions
           WHERE doc_type = _doc_type AND doc_id = _doc_id AND tenant_id = _tenant
  LOOP
    UPDATE public.items SET stock_on_hand = COALESCE(stock_on_hand,0) + r.quantity
      WHERE id = r.component_item_id;
  END LOOP;
  DELETE FROM public.composite_explosions WHERE doc_type = _doc_type AND doc_id = _doc_id AND tenant_id = _tenant;

  -- Apply new explosions
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(_lines,'[]'::jsonb))
  LOOP
    v_qty := COALESCE((l->>'quantity')::NUMERIC, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    FOR v_comp IN
      SELECT cic.component_item_id, cic.quantity AS comp_qty
      FROM public.composite_items ci
      JOIN public.composite_item_components cic ON cic.composite_item_id = ci.id
      WHERE ci.parent_item_id = (l->>'item_id')::UUID
        AND ci.tenant_id = _tenant
        AND ci.composite_type = 'kit'
    LOOP
      INSERT INTO public.composite_explosions(tenant_id, doc_type, doc_id, parent_item_id, component_item_id, quantity)
      VALUES (_tenant, _doc_type, _doc_id, (l->>'item_id')::UUID, v_comp.component_item_id, v_comp.comp_qty * v_qty);

      UPDATE public.items
        SET stock_on_hand = COALESCE(stock_on_hand,0) - (v_comp.comp_qty * v_qty)
        WHERE id = v_comp.component_item_id;
    END LOOP;
  END LOOP;
END $$;

-- Release explosions for a document (e.g. on delete/cancel)
CREATE OR REPLACE FUNCTION public.clear_composite_explosion(
  _tenant UUID, _doc_type TEXT, _doc_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant) THEN
    RAISE EXCEPTION 'Not a tenant member';
  END IF;
  FOR r IN SELECT component_item_id, quantity FROM public.composite_explosions
           WHERE doc_type = _doc_type AND doc_id = _doc_id AND tenant_id = _tenant
  LOOP
    UPDATE public.items SET stock_on_hand = COALESCE(stock_on_hand,0) + r.quantity
      WHERE id = r.component_item_id;
  END LOOP;
  DELETE FROM public.composite_explosions WHERE doc_type = _doc_type AND doc_id = _doc_id AND tenant_id = _tenant;
END $$;

-- Complete an assembly order: consume components at current WAC, increase finished-goods stock,
-- recompute parent WAC.
CREATE OR REPLACE FUNCTION public.complete_assembly_order(_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.assembly_orders%ROWTYPE;
  v_comp RECORD;
  v_qty_used NUMERIC;
  v_cost NUMERIC;
  v_total_cost NUMERIC := 0;
  v_parent_stock NUMERIC;
  v_parent_cost NUMERIC;
  v_new_cost NUMERIC;
BEGIN
  SELECT * INTO v_order FROM public.assembly_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assembly order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_order.tenant_id) THEN
    RAISE EXCEPTION 'Not a tenant member';
  END IF;
  IF v_order.status = 'completed' THEN RAISE EXCEPTION 'Already completed'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'Order is cancelled'; END IF;

  -- Iterate component BOM
  FOR v_comp IN
    SELECT cic.component_item_id, cic.quantity AS comp_qty, i.cost_price, i.stock_on_hand
    FROM public.composite_items ci
    JOIN public.composite_item_components cic ON cic.composite_item_id = ci.id
    JOIN public.items i ON i.id = cic.component_item_id
    WHERE ci.parent_item_id = v_order.assembly_item_id
      AND ci.tenant_id = v_order.tenant_id
  LOOP
    v_qty_used := v_comp.comp_qty * v_order.quantity;
    v_cost := COALESCE(v_comp.cost_price, 0);
    v_total_cost := v_total_cost + v_qty_used * v_cost;

    UPDATE public.items
      SET stock_on_hand = COALESCE(stock_on_hand,0) - v_qty_used
      WHERE id = v_comp.component_item_id;

    INSERT INTO public.assembly_consumptions(tenant_id, assembly_order_id, component_item_id, quantity_used, unit_cost)
    VALUES (v_order.tenant_id, v_order.id, v_comp.component_item_id, v_qty_used, v_cost);
  END LOOP;

  -- Recompute parent WAC and bump finished-goods stock
  SELECT COALESCE(stock_on_hand,0), COALESCE(cost_price,0)
    INTO v_parent_stock, v_parent_cost
    FROM public.items WHERE id = v_order.assembly_item_id FOR UPDATE;

  IF (v_parent_stock + v_order.quantity) > 0 THEN
    v_new_cost := (v_parent_stock * v_parent_cost + v_total_cost) / (v_parent_stock + v_order.quantity);
  ELSE
    v_new_cost := v_parent_cost;
  END IF;

  UPDATE public.items
    SET stock_on_hand = v_parent_stock + v_order.quantity,
        cost_price = v_new_cost
    WHERE id = v_order.assembly_item_id;

  UPDATE public.assembly_orders
    SET status = 'completed', completed_at = now()
    WHERE id = v_order.id;
END $$;
