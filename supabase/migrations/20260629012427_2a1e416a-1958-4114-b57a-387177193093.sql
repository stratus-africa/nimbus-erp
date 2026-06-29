
-- Extend locations to act as warehouses
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_tenant_code ON public.locations(tenant_id, code) WHERE code IS NOT NULL;

-- Per-warehouse stock
CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  reserved_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  in_transit_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_tenant ON public.warehouse_stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_item ON public.warehouse_stock(item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_stock TO authenticated;
GRANT ALL ON public.warehouse_stock TO service_role;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage warehouse_stock" ON public.warehouse_stock
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER trg_warehouse_stock_updated_at BEFORE UPDATE ON public.warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Transfer order status enum
DO $$ BEGIN
  CREATE TYPE public.transfer_order_status AS ENUM ('draft','confirmed','shipped','received','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.transfer_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_number TEXT NOT NULL,
  source_warehouse_id UUID NOT NULL REFERENCES public.locations(id),
  destination_warehouse_id UUID NOT NULL REFERENCES public.locations(id),
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.transfer_order_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  shipped_by UUID REFERENCES auth.users(id),
  received_by UUID REFERENCES auth.users(id),
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_warehouse_id <> destination_warehouse_id),
  UNIQUE (tenant_id, transfer_number)
);
CREATE INDEX IF NOT EXISTS idx_transfer_orders_tenant ON public.transfer_orders(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_orders TO authenticated;
GRANT ALL ON public.transfer_orders TO service_role;
ALTER TABLE public.transfer_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage transfer_orders" ON public.transfer_orders
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER trg_transfer_orders_updated_at BEFORE UPDATE ON public.transfer_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.transfer_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_order_id UUID NOT NULL REFERENCES public.transfer_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity_requested NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity_shipped NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transfer_order_items_order ON public.transfer_order_items(transfer_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_order_items TO authenticated;
GRANT ALL ON public.transfer_order_items TO service_role;
ALTER TABLE public.transfer_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage transfer_order_items" ON public.transfer_order_items
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- Inventory transactions: audit trail of stock movements per warehouse
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.locations(id),
  item_id UUID NOT NULL REFERENCES public.items(id),
  transaction_type TEXT NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_tx_tenant ON public.inventory_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON public.inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref ON public.inventory_transactions(reference_type, reference_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read inventory_transactions" ON public.inventory_transactions
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant members write inventory_transactions" ON public.inventory_transactions
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- Numbering series default for transfer orders
INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number)
SELECT id, 'transfer_order', 'TO-', 1 FROM public.tenants
ON CONFLICT DO NOTHING;

-- Helper: upsert per-warehouse stock row
CREATE OR REPLACE FUNCTION public._ws_upsert(_tenant UUID, _wh UUID, _item UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.warehouse_stock(tenant_id, warehouse_id, item_id)
    VALUES (_tenant, _wh, _item)
    ON CONFLICT (warehouse_id, item_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Workflow RPCs ----------------------------------------------------------

-- Confirm: reserve stock at source
CREATE OR REPLACE FUNCTION public.confirm_transfer_order(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to RECORD; v_line RECORD; v_avail NUMERIC;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_to.tenant_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_to.status <> 'draft' THEN RAISE EXCEPTION 'Only draft orders can be confirmed'; END IF;

  FOR v_line IN SELECT * FROM public.transfer_order_items WHERE transfer_order_id = _id LOOP
    PERFORM public._ws_upsert(v_to.tenant_id, v_to.source_warehouse_id, v_line.item_id);
    SELECT (quantity - reserved_quantity) INTO v_avail
      FROM public.warehouse_stock
     WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id FOR UPDATE;
    IF COALESCE(v_avail,0) < v_line.quantity_requested THEN
      RAISE EXCEPTION 'Insufficient available stock at source for item %', v_line.item_id;
    END IF;
    UPDATE public.warehouse_stock
       SET reserved_quantity = reserved_quantity + v_line.quantity_requested,
           updated_at = now()
     WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;
  END LOOP;

  UPDATE public.transfer_orders
     SET status = 'confirmed', approved_by = auth.uid(), updated_at = now()
   WHERE id = _id;
END $$;

-- Ship: move from on-hand at source to in-transit
CREATE OR REPLACE FUNCTION public.ship_transfer_order(_id UUID, _quantities JSONB DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to RECORD; v_line RECORD; v_qty NUMERIC;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_to.tenant_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_to.status NOT IN ('confirmed','shipped') THEN RAISE EXCEPTION 'Cannot ship from status %', v_to.status; END IF;

  FOR v_line IN SELECT * FROM public.transfer_order_items WHERE transfer_order_id = _id LOOP
    v_qty := COALESCE((_quantities->>v_line.id::text)::NUMERIC, v_line.quantity_requested - v_line.quantity_shipped);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_qty > (v_line.quantity_requested - v_line.quantity_shipped) THEN
      RAISE EXCEPTION 'Ship qty exceeds remaining for item %', v_line.item_id;
    END IF;

    UPDATE public.warehouse_stock
       SET quantity = quantity - v_qty,
           reserved_quantity = GREATEST(reserved_quantity - v_qty, 0),
           in_transit_quantity = in_transit_quantity + v_qty,
           updated_at = now()
     WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;

    UPDATE public.transfer_order_items
       SET quantity_shipped = quantity_shipped + v_qty
     WHERE id = v_line.id;

    INSERT INTO public.inventory_transactions(tenant_id, warehouse_id, item_id, transaction_type, quantity, reference_type, reference_id, created_by)
    VALUES (v_to.tenant_id, v_to.source_warehouse_id, v_line.item_id, 'TRANSFER_OUT', -v_qty, 'transfer_orders', _id, auth.uid());

    UPDATE public.items SET stock_on_hand = COALESCE(stock_on_hand,0) - v_qty WHERE id = v_line.item_id;
  END LOOP;

  UPDATE public.transfer_orders
     SET status = 'shipped', shipped_by = auth.uid(), shipped_at = now(), updated_at = now()
   WHERE id = _id;
END $$;

-- Receive: move from in-transit (source) to on-hand (destination)
CREATE OR REPLACE FUNCTION public.receive_transfer_order(_id UUID, _quantities JSONB DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to RECORD; v_line RECORD; v_qty NUMERIC; v_all_done BOOLEAN;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_to.tenant_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_to.status NOT IN ('shipped','received') THEN RAISE EXCEPTION 'Cannot receive from status %', v_to.status; END IF;

  FOR v_line IN SELECT * FROM public.transfer_order_items WHERE transfer_order_id = _id LOOP
    v_qty := COALESCE((_quantities->>v_line.id::text)::NUMERIC, v_line.quantity_shipped - v_line.quantity_received);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_qty > (v_line.quantity_shipped - v_line.quantity_received) THEN
      RAISE EXCEPTION 'Receive qty exceeds in-transit for item %', v_line.item_id;
    END IF;

    UPDATE public.warehouse_stock
       SET in_transit_quantity = GREATEST(in_transit_quantity - v_qty, 0), updated_at = now()
     WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;

    PERFORM public._ws_upsert(v_to.tenant_id, v_to.destination_warehouse_id, v_line.item_id);
    UPDATE public.warehouse_stock
       SET quantity = quantity + v_qty, updated_at = now()
     WHERE warehouse_id = v_to.destination_warehouse_id AND item_id = v_line.item_id;

    UPDATE public.transfer_order_items
       SET quantity_received = quantity_received + v_qty
     WHERE id = v_line.id;

    INSERT INTO public.inventory_transactions(tenant_id, warehouse_id, item_id, transaction_type, quantity, reference_type, reference_id, created_by)
    VALUES (v_to.tenant_id, v_to.destination_warehouse_id, v_line.item_id, 'TRANSFER_IN', v_qty, 'transfer_orders', _id, auth.uid());

    UPDATE public.items SET stock_on_hand = COALESCE(stock_on_hand,0) + v_qty WHERE id = v_line.item_id;
  END LOOP;

  SELECT bool_and(quantity_received >= quantity_requested) INTO v_all_done
    FROM public.transfer_order_items WHERE transfer_order_id = _id;

  UPDATE public.transfer_orders
     SET status = CASE WHEN v_all_done THEN 'completed'::transfer_order_status ELSE 'received'::transfer_order_status END,
         received_by = auth.uid(), received_at = now(), updated_at = now()
   WHERE id = _id;
END $$;

-- Cancel: release reservations / in-transit; only valid before completion
CREATE OR REPLACE FUNCTION public.cancel_transfer_order(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to RECORD; v_line RECORD; v_outstanding NUMERIC;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_to.tenant_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_to.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Cannot cancel from status %', v_to.status; END IF;

  FOR v_line IN SELECT * FROM public.transfer_order_items WHERE transfer_order_id = _id LOOP
    -- release reservations (confirmed but not yet shipped)
    v_outstanding := GREATEST(v_line.quantity_requested - v_line.quantity_shipped, 0);
    IF v_to.status = 'confirmed' AND v_outstanding > 0 THEN
      UPDATE public.warehouse_stock
         SET reserved_quantity = GREATEST(reserved_quantity - v_outstanding, 0), updated_at = now()
       WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;
    END IF;
    -- return any in-transit back to source on-hand
    v_outstanding := GREATEST(v_line.quantity_shipped - v_line.quantity_received, 0);
    IF v_outstanding > 0 THEN
      UPDATE public.warehouse_stock
         SET in_transit_quantity = GREATEST(in_transit_quantity - v_outstanding, 0),
             quantity = quantity + v_outstanding,
             updated_at = now()
       WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;
      UPDATE public.items SET stock_on_hand = COALESCE(stock_on_hand,0) + v_outstanding WHERE id = v_line.item_id;
      INSERT INTO public.inventory_transactions(tenant_id, warehouse_id, item_id, transaction_type, quantity, reference_type, reference_id, created_by)
      VALUES (v_to.tenant_id, v_to.source_warehouse_id, v_line.item_id, 'TRANSFER_CANCELLED', v_outstanding, 'transfer_orders', _id, auth.uid());
    END IF;
  END LOOP;

  UPDATE public.transfer_orders SET status='cancelled', updated_at=now() WHERE id=_id;
END $$;
