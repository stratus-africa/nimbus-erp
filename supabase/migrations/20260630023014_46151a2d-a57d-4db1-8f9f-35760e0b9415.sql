
-- Transfer order approval audit log
CREATE TABLE public.transfer_order_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_order_id UUID NOT NULL REFERENCES public.transfer_orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- requested | approved | rejected | confirmed | shipped | received | cancelled
  actor_id UUID,
  actor_name TEXT,
  comments TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_to_approvals_to ON public.transfer_order_approvals(transfer_order_id, created_at DESC);
GRANT SELECT, INSERT ON public.transfer_order_approvals TO authenticated;
GRANT ALL ON public.transfer_order_approvals TO service_role;
ALTER TABLE public.transfer_order_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_members_can_view_approvals" ON public.transfer_order_approvals
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tenant_members_can_insert_approvals" ON public.transfer_order_approvals
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- Add approval fields to transfer_orders
ALTER TABLE public.transfer_orders
  ADD COLUMN IF NOT EXISTS requested_by UUID,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS carrier TEXT,
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT;

-- Packages
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_number TEXT NOT NULL,
  package_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_type TEXT NOT NULL, -- 'transfer_orders', 'sales_orders'
  source_id UUID NOT NULL,
  warehouse_id UUID REFERENCES public.locations(id),
  weight NUMERIC(12,3),
  weight_unit TEXT DEFAULT 'kg',
  dimensions TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'packed', -- packed | shipped | delivered
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_packages_source ON public.packages(source_type, source_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_packages_all" ON public.packages
  FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER set_packages_updated BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Shipments
CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_number TEXT NOT NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  shipment_date DATE DEFAULT CURRENT_DATE,
  delivered_date DATE,
  status TEXT NOT NULL DEFAULT 'in_transit', -- in_transit | delivered | returned
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipments_source ON public.shipments(source_type, source_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipments TO authenticated;
GRANT ALL ON public.shipments TO service_role;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_shipments_all" ON public.shipments
  FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER set_shipments_updated BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Numbering series defaults for packages & shipments
INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number)
SELECT id, 'package', 'PKG-', 1 FROM public.tenants
ON CONFLICT DO NOTHING;
INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number)
SELECT id, 'shipment', 'SHP-', 1 FROM public.tenants
ON CONFLICT DO NOTHING;

-- Permission helper: reads tenant_settings.value->'transfer_orders'->'permissions'
-- shape: { "request": ["company_admin","inventory","sales","purchasing"],
--          "approve": ["company_admin"],
--          "ship":    ["company_admin","inventory"],
--          "receive": ["company_admin","inventory"],
--          "cancel":  ["company_admin"] }
CREATE OR REPLACE FUNCTION public.can_transfer_action(_tenant UUID, _action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_roles TEXT[];
  v_user_roles TEXT[];
  v_defaults JSONB := jsonb_build_object(
    'request', jsonb_build_array('company_admin','inventory','sales','purchasing'),
    'approve', jsonb_build_array('company_admin'),
    'confirm', jsonb_build_array('company_admin','inventory'),
    'ship',    jsonb_build_array('company_admin','inventory'),
    'receive', jsonb_build_array('company_admin','inventory'),
    'cancel',  jsonb_build_array('company_admin')
  );
  v_cfg JSONB;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN TRUE; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _tenant) THEN RETURN FALSE; END IF;

  SELECT (value -> 'transfer_orders' -> 'permissions') INTO v_cfg
    FROM public.tenant_settings WHERE tenant_id = _tenant AND key = 'transfer_orders' LIMIT 1;

  IF v_cfg IS NULL OR v_cfg->_action IS NULL THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_defaults->_action)) INTO v_roles;
  ELSE
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_cfg->_action)) INTO v_roles;
  END IF;

  SELECT ARRAY(SELECT role::text FROM public.user_roles
               WHERE user_id = auth.uid() AND (tenant_id = _tenant OR role = 'super_admin'))
  INTO v_user_roles;

  RETURN v_user_roles && v_roles OR 'company_admin' = ANY(v_user_roles);
END $$;

-- New RPCs: request & approve & reject
CREATE OR REPLACE FUNCTION public.request_transfer_approval(_id UUID, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to public.transfer_orders%ROWTYPE; v_name TEXT;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.can_transfer_action(v_to.tenant_id, 'request') THEN RAISE EXCEPTION 'Not authorized to request approval'; END IF;
  IF v_to.status <> 'draft' THEN RAISE EXCEPTION 'Only draft transfer orders can be submitted for approval'; END IF;
  UPDATE public.transfer_orders SET status='pending_approval', requested_by=auth.uid(), requested_at=now(), updated_at=now() WHERE id=_id;
  SELECT COALESCE(full_name,email) INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.transfer_order_approvals(tenant_id, transfer_order_id, action, actor_id, actor_name, comments)
  VALUES (v_to.tenant_id, _id, 'requested', auth.uid(), v_name, _note);
END $$;

CREATE OR REPLACE FUNCTION public.approve_transfer_order(_id UUID, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to public.transfer_orders%ROWTYPE; v_name TEXT;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.can_transfer_action(v_to.tenant_id, 'approve') THEN RAISE EXCEPTION 'Not authorized to approve'; END IF;
  IF v_to.status <> 'pending_approval' THEN RAISE EXCEPTION 'Order is not pending approval'; END IF;
  UPDATE public.transfer_orders SET status='confirmed', approved_by=auth.uid(), updated_at=now() WHERE id=_id;
  SELECT COALESCE(full_name,email) INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.transfer_order_approvals(tenant_id, transfer_order_id, action, actor_id, actor_name, comments)
  VALUES (v_to.tenant_id, _id, 'approved', auth.uid(), v_name, _note);
  -- Reserve stock automatically once approved
  PERFORM public._reserve_transfer_stock(_id);
END $$;

CREATE OR REPLACE FUNCTION public._reserve_transfer_stock(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to public.transfer_orders%ROWTYPE; v_line RECORD; v_avail NUMERIC;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id;
  FOR v_line IN SELECT * FROM public.transfer_order_items WHERE transfer_order_id = _id LOOP
    PERFORM public._ws_upsert(v_to.tenant_id, v_to.source_warehouse_id, v_line.item_id);
    SELECT (quantity - reserved_quantity) INTO v_avail
      FROM public.warehouse_stock
     WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id FOR UPDATE;
    IF COALESCE(v_avail,0) < v_line.quantity_requested THEN
      RAISE EXCEPTION 'Insufficient available stock at source for item %', v_line.item_id;
    END IF;
    UPDATE public.warehouse_stock
       SET reserved_quantity = reserved_quantity + v_line.quantity_requested, updated_at = now()
     WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.reject_transfer_order(_id UUID, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to public.transfer_orders%ROWTYPE; v_name TEXT;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.can_transfer_action(v_to.tenant_id, 'approve') THEN RAISE EXCEPTION 'Not authorized to reject'; END IF;
  IF v_to.status <> 'pending_approval' THEN RAISE EXCEPTION 'Order is not pending approval'; END IF;
  UPDATE public.transfer_orders SET status='rejected', rejected_by=auth.uid(), rejected_at=now(), rejection_reason=_reason, updated_at=now() WHERE id=_id;
  SELECT COALESCE(full_name,email) INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.transfer_order_approvals(tenant_id, transfer_order_id, action, actor_id, actor_name, comments)
  VALUES (v_to.tenant_id, _id, 'rejected', auth.uid(), v_name, _reason);
END $$;

-- Replace confirm/ship/receive/cancel to (a) check permission and (b) log to approvals
CREATE OR REPLACE FUNCTION public.confirm_transfer_order(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to public.transfer_orders%ROWTYPE; v_name TEXT;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.can_transfer_action(v_to.tenant_id, 'confirm') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_to.status <> 'draft' THEN RAISE EXCEPTION 'Only draft orders can be confirmed'; END IF;
  PERFORM public._reserve_transfer_stock(_id);
  UPDATE public.transfer_orders SET status='confirmed', approved_by=auth.uid(), updated_at=now() WHERE id=_id;
  SELECT COALESCE(full_name,email) INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.transfer_order_approvals(tenant_id, transfer_order_id, action, actor_id, actor_name)
  VALUES (v_to.tenant_id, _id, 'confirmed', auth.uid(), v_name);
END $$;

CREATE OR REPLACE FUNCTION public.ship_transfer_order(_id uuid, _quantities jsonb DEFAULT NULL, _carrier TEXT DEFAULT NULL, _tracking TEXT DEFAULT NULL, _tracking_url TEXT DEFAULT NULL, _create_package BOOLEAN DEFAULT TRUE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to public.transfer_orders%ROWTYPE; v_line RECORD; v_qty NUMERIC; v_name TEXT; v_pkg_id UUID; v_shp_id UUID; v_pkg_no TEXT; v_shp_no TEXT;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.can_transfer_action(v_to.tenant_id, 'ship') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_to.status NOT IN ('confirmed','shipped') THEN RAISE EXCEPTION 'Cannot ship from status %', v_to.status; END IF;

  FOR v_line IN SELECT * FROM public.transfer_order_items WHERE transfer_order_id = _id LOOP
    v_qty := COALESCE((_quantities->>v_line.id::text)::NUMERIC, v_line.quantity_requested - v_line.quantity_shipped);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_qty > (v_line.quantity_requested - v_line.quantity_shipped) THEN RAISE EXCEPTION 'Ship qty exceeds remaining'; END IF;

    UPDATE public.warehouse_stock
       SET quantity = quantity - v_qty,
           reserved_quantity = GREATEST(reserved_quantity - v_qty, 0),
           in_transit_quantity = in_transit_quantity + v_qty,
           updated_at = now()
     WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;
    UPDATE public.transfer_order_items SET quantity_shipped = quantity_shipped + v_qty WHERE id = v_line.id;
    INSERT INTO public.inventory_transactions(tenant_id, warehouse_id, item_id, transaction_type, quantity, reference_type, reference_id, created_by)
    VALUES (v_to.tenant_id, v_to.source_warehouse_id, v_line.item_id, 'TRANSFER_OUT', -v_qty, 'transfer_orders', _id, auth.uid());
    UPDATE public.items SET stock_on_hand = COALESCE(stock_on_hand,0) - v_qty WHERE id = v_line.item_id;
  END LOOP;

  -- Optionally create package + shipment
  IF _create_package THEN
    v_pkg_no := public.next_doc_number(v_to.tenant_id, 'package');
    INSERT INTO public.packages(tenant_id, package_number, source_type, source_id, warehouse_id, status, created_by)
    VALUES (v_to.tenant_id, v_pkg_no, 'transfer_orders', _id, v_to.source_warehouse_id, 'shipped', auth.uid())
    RETURNING id INTO v_pkg_id;

    v_shp_no := public.next_doc_number(v_to.tenant_id, 'shipment');
    INSERT INTO public.shipments(tenant_id, shipment_number, package_id, source_type, source_id, carrier, tracking_number, tracking_url, status, created_by)
    VALUES (v_to.tenant_id, v_shp_no, v_pkg_id, 'transfer_orders', _id, _carrier, _tracking, _tracking_url, 'in_transit', auth.uid())
    RETURNING id INTO v_shp_id;
  END IF;

  UPDATE public.transfer_orders
     SET status='shipped', shipped_by=auth.uid(), shipped_at=now(),
         carrier=COALESCE(_carrier, carrier),
         tracking_number=COALESCE(_tracking, tracking_number),
         tracking_url=COALESCE(_tracking_url, tracking_url),
         updated_at=now()
   WHERE id=_id;

  SELECT COALESCE(full_name,email) INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.transfer_order_approvals(tenant_id, transfer_order_id, action, actor_id, actor_name, metadata)
  VALUES (v_to.tenant_id, _id, 'shipped', auth.uid(), v_name,
          jsonb_build_object('carrier', _carrier, 'tracking_number', _tracking, 'package_id', v_pkg_id, 'shipment_id', v_shp_id));
  RETURN v_shp_id;
END $$;

CREATE OR REPLACE FUNCTION public.receive_transfer_order(_id uuid, _quantities jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to public.transfer_orders%ROWTYPE; v_line RECORD; v_qty NUMERIC; v_all_done BOOLEAN; v_name TEXT;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.can_transfer_action(v_to.tenant_id, 'receive') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_to.status NOT IN ('shipped','received') THEN RAISE EXCEPTION 'Cannot receive from status %', v_to.status; END IF;

  FOR v_line IN SELECT * FROM public.transfer_order_items WHERE transfer_order_id = _id LOOP
    v_qty := COALESCE((_quantities->>v_line.id::text)::NUMERIC, v_line.quantity_shipped - v_line.quantity_received);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_qty > (v_line.quantity_shipped - v_line.quantity_received) THEN RAISE EXCEPTION 'Receive qty exceeds in-transit'; END IF;

    UPDATE public.warehouse_stock SET in_transit_quantity = GREATEST(in_transit_quantity - v_qty,0), updated_at=now()
     WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;

    PERFORM public._ws_upsert(v_to.tenant_id, v_to.destination_warehouse_id, v_line.item_id);
    UPDATE public.warehouse_stock SET quantity = quantity + v_qty, updated_at=now()
     WHERE warehouse_id = v_to.destination_warehouse_id AND item_id = v_line.item_id;

    UPDATE public.transfer_order_items SET quantity_received = quantity_received + v_qty WHERE id = v_line.id;
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

  -- Mark related shipments delivered when fully done
  IF v_all_done THEN
    UPDATE public.shipments SET status='delivered', delivered_date=CURRENT_DATE, updated_at=now()
      WHERE source_type='transfer_orders' AND source_id=_id AND status<>'delivered';
    UPDATE public.packages SET status='delivered', updated_at=now()
      WHERE source_type='transfer_orders' AND source_id=_id AND status<>'delivered';
  END IF;

  SELECT COALESCE(full_name,email) INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.transfer_order_approvals(tenant_id, transfer_order_id, action, actor_id, actor_name)
  VALUES (v_to.tenant_id, _id, CASE WHEN v_all_done THEN 'completed' ELSE 'received' END, auth.uid(), v_name);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_transfer_order(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_to public.transfer_orders%ROWTYPE; v_line RECORD; v_outstanding NUMERIC; v_name TEXT;
BEGIN
  SELECT * INTO v_to FROM public.transfer_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer order not found'; END IF;
  IF NOT public.can_transfer_action(v_to.tenant_id, 'cancel') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_to.status IN ('completed','cancelled','rejected') THEN RAISE EXCEPTION 'Cannot cancel from status %', v_to.status; END IF;

  FOR v_line IN SELECT * FROM public.transfer_order_items WHERE transfer_order_id = _id LOOP
    v_outstanding := GREATEST(v_line.quantity_requested - v_line.quantity_shipped, 0);
    IF v_to.status = 'confirmed' AND v_outstanding > 0 THEN
      UPDATE public.warehouse_stock SET reserved_quantity = GREATEST(reserved_quantity - v_outstanding,0), updated_at=now()
       WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;
    END IF;
    v_outstanding := GREATEST(v_line.quantity_shipped - v_line.quantity_received, 0);
    IF v_outstanding > 0 THEN
      UPDATE public.warehouse_stock
         SET in_transit_quantity = GREATEST(in_transit_quantity - v_outstanding, 0),
             quantity = quantity + v_outstanding, updated_at = now()
       WHERE warehouse_id = v_to.source_warehouse_id AND item_id = v_line.item_id;
      UPDATE public.items SET stock_on_hand = COALESCE(stock_on_hand,0) + v_outstanding WHERE id = v_line.item_id;
      INSERT INTO public.inventory_transactions(tenant_id, warehouse_id, item_id, transaction_type, quantity, reference_type, reference_id, created_by)
      VALUES (v_to.tenant_id, v_to.source_warehouse_id, v_line.item_id, 'TRANSFER_CANCELLED', v_outstanding, 'transfer_orders', _id, auth.uid());
    END IF;
  END LOOP;

  UPDATE public.transfer_orders SET status='cancelled', updated_at=now() WHERE id=_id;
  UPDATE public.shipments SET status='returned', updated_at=now() WHERE source_type='transfer_orders' AND source_id=_id AND status='in_transit';

  SELECT COALESCE(full_name,email) INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.transfer_order_approvals(tenant_id, transfer_order_id, action, actor_id, actor_name)
  VALUES (v_to.tenant_id, _id, 'cancelled', auth.uid(), v_name);
END $$;
