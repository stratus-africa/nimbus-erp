
-- 1. package_items table
CREATE TABLE IF NOT EXISTS public.package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  sales_order_line_id UUID REFERENCES public.sales_order_lines(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  description TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_items TO authenticated;
GRANT ALL ON public.package_items TO service_role;
ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pkg_items tenant access" ON public.package_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND public.is_tenant_member(auth.uid(), p.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND public.is_tenant_member(auth.uid(), p.tenant_id)));
CREATE INDEX IF NOT EXISTS package_items_package_idx ON public.package_items(package_id);

-- 2. shipment_packages join table
CREATE TABLE IF NOT EXISTS public.shipment_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, package_id),
  UNIQUE (package_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_packages TO authenticated;
GRANT ALL ON public.shipment_packages TO service_role;
ALTER TABLE public.shipment_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipment_pkgs tenant access" ON public.shipment_packages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = shipment_id AND public.is_tenant_member(auth.uid(), s.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = shipment_id AND public.is_tenant_member(auth.uid(), s.tenant_id)));

-- 3. user_warehouses restriction table
CREATE TABLE IF NOT EXISTS public.user_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, warehouse_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_warehouses TO authenticated;
GRANT ALL ON public.user_warehouses TO service_role;
ALTER TABLE public.user_warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_wh self read" ON public.user_warehouses FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), tenant_id, 'company_admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "user_wh admin write" ON public.user_warehouses FOR ALL
  USING (public.has_role(auth.uid(), tenant_id, 'company_admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'company_admin') OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS user_wh_user_tenant_idx ON public.user_warehouses(user_id, tenant_id);

-- 4. Helper: user_has_warehouse_access
CREATE OR REPLACE FUNCTION public.user_has_warehouse_access(_user uuid, _tenant uuid, _warehouse uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    public.is_super_admin(_user)
    OR public.has_role(_user, _tenant, 'company_admin')
    OR NOT EXISTS (SELECT 1 FROM public.user_warehouses WHERE user_id=_user AND tenant_id=_tenant)
    OR EXISTS (SELECT 1 FROM public.user_warehouses WHERE user_id=_user AND tenant_id=_tenant AND warehouse_id=_warehouse);
$$;

-- 5. Create package from sales order
CREATE OR REPLACE FUNCTION public.create_package_from_sales_order(_so_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.sales_orders%ROWTYPE; v_pkg_id uuid; v_pkg_no text; v_wh uuid; v_actor_name text;
BEGIN
  SELECT * INTO v_so FROM public.sales_orders WHERE id=_so_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_so.tenant_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT public.has_permission(auth.uid(), v_so.tenant_id, 'sales_orders', 'edit') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- pick primary warehouse for tenant (first location)
  SELECT id INTO v_wh FROM public.locations WHERE tenant_id=v_so.tenant_id ORDER BY created_at LIMIT 1;

  v_pkg_no := public.next_doc_number(v_so.tenant_id, 'package');
  INSERT INTO public.packages(tenant_id, package_number, package_date, source_type, source_id, warehouse_id, status, created_by)
  VALUES (v_so.tenant_id, v_pkg_no, CURRENT_DATE, 'sales_orders', _so_id, v_wh, 'packed', auth.uid())
  RETURNING id INTO v_pkg_id;

  INSERT INTO public.package_items(package_id, sales_order_line_id, item_id, description, quantity, position)
  SELECT v_pkg_id, sol.id, sol.item_id, sol.description, sol.quantity, COALESCE(sol.position, 0)
  FROM public.sales_order_lines sol WHERE sol.sales_order_id = _so_id
  ORDER BY sol.position NULLS LAST;

  SELECT COALESCE(full_name, email) INTO v_actor_name FROM public.profiles WHERE user_id=auth.uid();
  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_so.tenant_id, auth.uid(), COALESCE(v_actor_name,'System'), 'packages', v_pkg_id, 'package_created_from_so',
          format('%s created package %s from sales order %s', COALESCE(v_actor_name,'System'), v_pkg_no, v_so.so_number),
          jsonb_build_object('sales_order_id', _so_id, 'package_number', v_pkg_no));
  RETURN v_pkg_id;
END $$;

-- 6. Create shipment from package
CREATE OR REPLACE FUNCTION public.create_shipment_from_package(_package_id uuid, _carrier text, _tracking text, _tracking_url text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pkg public.packages%ROWTYPE; v_shp_id uuid; v_shp_no text;
BEGIN
  SELECT * INTO v_pkg FROM public.packages WHERE id=_package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Package not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_pkg.tenant_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  v_shp_no := public.next_doc_number(v_pkg.tenant_id, 'shipment');
  INSERT INTO public.shipments(tenant_id, shipment_number, package_id, source_type, source_id, carrier, tracking_number, tracking_url, status, created_by)
  VALUES (v_pkg.tenant_id, v_shp_no, _package_id, v_pkg.source_type, v_pkg.source_id, _carrier, _tracking, _tracking_url, 'in_transit', auth.uid())
  RETURNING id INTO v_shp_id;

  INSERT INTO public.shipment_packages(shipment_id, package_id) VALUES (v_shp_id, _package_id);
  UPDATE public.packages SET status='shipped', updated_at=now() WHERE id=_package_id;
  RETURN v_shp_id;
END $$;

-- 7. Attach packages to shipment
CREATE OR REPLACE FUNCTION public.attach_packages_to_shipment(_shipment_id uuid, _package_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_shp public.shipments%ROWTYPE; v_pkg_id uuid; v_pkg public.packages%ROWTYPE;
BEGIN
  SELECT * INTO v_shp FROM public.shipments WHERE id=_shipment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_shp.tenant_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  FOREACH v_pkg_id IN ARRAY _package_ids LOOP
    SELECT * INTO v_pkg FROM public.packages WHERE id=v_pkg_id;
    IF v_pkg.tenant_id <> v_shp.tenant_id THEN RAISE EXCEPTION 'Cross-tenant not allowed'; END IF;
    IF EXISTS(SELECT 1 FROM public.shipment_packages WHERE package_id=v_pkg_id AND shipment_id<>_shipment_id) THEN
      RAISE EXCEPTION 'Package % already on another shipment', v_pkg.package_number;
    END IF;
    INSERT INTO public.shipment_packages(shipment_id, package_id) VALUES (_shipment_id, v_pkg_id)
      ON CONFLICT DO NOTHING;
    UPDATE public.packages SET status='shipped', updated_at=now() WHERE id=v_pkg_id;
  END LOOP;
END $$;
