CREATE OR REPLACE FUNCTION public.create_shipment_from_packages(
  _package_ids uuid[],
  _carrier text DEFAULT NULL,
  _tracking text DEFAULT NULL,
  _tracking_url text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_first public.packages%ROWTYPE;
  v_shp_id uuid;
  v_shp_no text;
  v_pkg_id uuid;
  v_pkg public.packages%ROWTYPE;
BEGIN
  IF _package_ids IS NULL OR array_length(_package_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No packages provided';
  END IF;

  SELECT * INTO v_first FROM public.packages WHERE id = _package_ids[1];
  IF NOT FOUND THEN RAISE EXCEPTION 'Package not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_first.tenant_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Reject any package already on a shipment
  IF EXISTS (
    SELECT 1 FROM public.shipment_packages sp
    WHERE sp.package_id = ANY(_package_ids)
  ) THEN
    RAISE EXCEPTION 'One or more packages are already on a shipment';
  END IF;

  v_shp_no := public.next_doc_number(v_first.tenant_id, 'shipment');
  INSERT INTO public.shipments(
    tenant_id, shipment_number, package_id, source_type, source_id,
    carrier, tracking_number, tracking_url, status, created_by
  ) VALUES (
    v_first.tenant_id, v_shp_no, v_first.id, v_first.source_type, v_first.source_id,
    _carrier, _tracking, _tracking_url, 'in_transit', auth.uid()
  ) RETURNING id INTO v_shp_id;

  FOREACH v_pkg_id IN ARRAY _package_ids LOOP
    SELECT * INTO v_pkg FROM public.packages WHERE id = v_pkg_id;
    IF v_pkg.tenant_id <> v_first.tenant_id THEN
      RAISE EXCEPTION 'Cross-tenant not allowed';
    END IF;
    INSERT INTO public.shipment_packages(shipment_id, package_id)
    VALUES (v_shp_id, v_pkg_id) ON CONFLICT DO NOTHING;
    UPDATE public.packages SET status='shipped', updated_at=now() WHERE id = v_pkg_id;
  END LOOP;

  RETURN v_shp_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_shipment_from_packages(uuid[], text, text, text) TO authenticated;