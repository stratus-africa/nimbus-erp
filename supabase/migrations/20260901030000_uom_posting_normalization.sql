-- =========================================================
-- UOM Posting Normalization
--
-- Replaces post_adjustment_unchecked, post_transfer_unchecked,
-- and post_production_order_unchecked with versions that:
--
--   1. Resolve the document's entry UOM (adj.uom / tr.uom /
--      bom_lines.uom / production_orders.quantity_uom).
--   2. Convert the entered quantity to the item's STOCK UOM
--      using uom_convert() before writing stock_movements.
--   3. Store the original (pre-conversion) quantity and UOM
--      in stock_movements.source_quantity and source_uom
--      for full audit traceability.
--   4. Pre-compute and cache bom_lines.uom_factor on the BOM
--      line at BOM-save time via a helper RPC.
--
-- Backward compatibility:
--   • If uom IS NULL on the document, the quantity is treated
--     as already in the item's stock UOM (same as before).
--   • All monetary calculations (val, component_cost) use the
--     STOCK-UOM quantity, consistent with how items.cost is
--     stored (per stock UOM unit).
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: resolve quantity to stock UOM
--
-- If doc_uom IS NULL or doc_uom = item.uom → qty unchanged.
-- Otherwise calls uom_convert().  Returns NUMERIC(18,8).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._resolve_stock_qty(
  _qty       numeric,
  _doc_uom   text,
  _item_id   uuid,
  _tenant_id uuid
)
RETURNS numeric(18,8)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stock_uom text;
BEGIN
  -- Get item's stock UOM
  SELECT COALESCE(uom, 'pc') INTO v_stock_uom
  FROM public.items
  WHERE id = _item_id AND deleted_at IS NULL;

  -- No conversion needed
  IF _doc_uom IS NULL OR _doc_uom = '' OR _doc_uom = v_stock_uom THEN
    RETURN ROUND(COALESCE(_qty, 0)::numeric(18,8), 8);
  END IF;

  -- Convert
  RETURN public.uom_convert(
    COALESCE(_qty, 0), _doc_uom, v_stock_uom, _item_id, _tenant_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._resolve_stock_qty(numeric, text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._resolve_stock_qty(numeric, text, uuid, uuid) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  post_adjustment_unchecked  (UOM-aware replacement)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_adjustment_unchecked(_adjustment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  adj           record;
  v_item        record;
  inv_acct      uuid;
  var_acct      uuid;
  v_stock_qty   numeric(18,8);   -- quantity in stock UOM
  v_unit_cost   numeric(14,4);
  val           numeric(14,2);
BEGIN
  SELECT * INTO adj
  FROM public.inventory_adjustments
  WHERE id = _adjustment_id AND deleted_at IS NULL;
  IF adj.id IS NULL THEN RAISE EXCEPTION 'Adjustment not found'; END IF;

  SELECT * INTO v_item FROM public.items WHERE id = adj.item_id AND deleted_at IS NULL;

  -- ── UOM normalization ───────────────────────────────────────────────────────
  v_stock_qty := public._resolve_stock_qty(
    adj.quantity, adj.uom, adj.item_id, adj.tenant_id
  );

  v_unit_cost := COALESCE(v_item.cost, 0);
  val := ROUND(v_stock_qty * v_unit_cost, 2);

  -- ── Stock movement ──────────────────────────────────────────────────────────
  INSERT INTO public.stock_movements (
    tenant_id, item_id, warehouse_id,
    quantity, unit_cost,
    uom, source_uom, source_quantity,
    ref_type, ref_id, note, created_by
  ) VALUES (
    adj.tenant_id, adj.item_id, adj.warehouse_id,
    v_stock_qty, v_unit_cost,
    v_item.uom,                          -- stock UOM
    COALESCE(adj.uom, v_item.uom),       -- source UOM (what the user typed)
    CASE WHEN adj.uom IS NOT NULL AND adj.uom <> v_item.uom
         THEN adj.quantity ELSE NULL END, -- source qty only if conversion happened
    'adjustment', adj.id,
    'Adjustment ' || COALESCE(adj.number, ''),
    auth.uid()
  );

  -- ── Cache UOM factor on the document ───────────────────────────────────────
  UPDATE public.inventory_adjustments
  SET uom_factor = CASE
        WHEN v_stock_qty <> 0 AND adj.quantity <> 0
        THEN ROUND(v_stock_qty / adj.quantity, 8)
        ELSE 1
      END
  WHERE id = _adjustment_id;

  -- ── Journal entries ─────────────────────────────────────────────────────────
  inv_acct := public._cfg_account(adj.tenant_id, 'inventory');
  var_acct := public._cfg_account(adj.tenant_id, 'inventory_variance');

  IF val <> 0 AND inv_acct IS NOT NULL AND var_acct IS NOT NULL THEN
    IF val > 0 THEN
      PERFORM public._emit_journal(adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number, ''), 'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', inv_acct, 'debit',  val,      'credit', 0,   'memo', 'Inventory IN'),
          jsonb_build_object('account_id', var_acct, 'debit',  0,        'credit', val, 'memo', 'Inventory variance CR')
        )
      );
    ELSE
      PERFORM public._emit_journal(adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number, ''), 'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', var_acct, 'debit',  ABS(val), 'credit', 0,        'memo', 'Inventory variance DR'),
          jsonb_build_object('account_id', inv_acct, 'debit',  0,        'credit', ABS(val), 'memo', 'Inventory OUT')
        )
      );
    END IF;
  END IF;

  -- ── Finalise ────────────────────────────────────────────────────────────────
  UPDATE public.inventory_adjustments
  SET status = 'Posted', posted_at = now()
  WHERE id = _adjustment_id;

  INSERT INTO public.document_events
    (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (adj.tenant_id, 'adjustment', adj.id, 'Posted',
    'Inventory adjustment posted' ||
      CASE WHEN adj.uom IS NOT NULL AND adj.uom <> v_item.uom
           THEN ' (converted from ' || adj.uom || ' to ' || COALESCE(v_item.uom,'pc') || ')'
           ELSE '' END,
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _adjustment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_adjustment_unchecked(uuid) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  post_transfer_unchecked  (UOM-aware replacement)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_transfer_unchecked(_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tr            record;
  v_item        record;
  v_stock_qty   numeric(18,8);
  v_unit_cost   numeric(14,4);
BEGIN
  SELECT * INTO tr
  FROM public.inventory_transfers
  WHERE id = _transfer_id AND deleted_at IS NULL;
  IF tr.id IS NULL THEN RAISE EXCEPTION 'Transfer not found'; END IF;

  SELECT * INTO v_item FROM public.items WHERE id = tr.item_id AND deleted_at IS NULL;

  -- ── UOM normalization ───────────────────────────────────────────────────────
  v_stock_qty := public._resolve_stock_qty(
    tr.quantity, tr.uom, tr.item_id, tr.tenant_id
  );

  v_unit_cost := COALESCE(v_item.cost, 0);

  -- ── Stock movements (no GL entries — internal move) ─────────────────────────
  INSERT INTO public.stock_movements (
    tenant_id, item_id, warehouse_id,
    quantity, unit_cost,
    uom, source_uom, source_quantity,
    ref_type, ref_id, note, created_by
  ) VALUES (
    tr.tenant_id, tr.item_id, tr.from_warehouse_id,
    -v_stock_qty, v_unit_cost,
    v_item.uom, COALESCE(tr.uom, v_item.uom),
    CASE WHEN tr.uom IS NOT NULL AND tr.uom <> v_item.uom THEN tr.quantity ELSE NULL END,
    'transfer_out', tr.id,
    'Transfer OUT ' || COALESCE(tr.number, ''),
    auth.uid()
  ), (
    tr.tenant_id, tr.item_id, tr.to_warehouse_id,
    v_stock_qty, v_unit_cost,
    v_item.uom, COALESCE(tr.uom, v_item.uom),
    CASE WHEN tr.uom IS NOT NULL AND tr.uom <> v_item.uom THEN tr.quantity ELSE NULL END,
    'transfer_in', tr.id,
    'Transfer IN ' || COALESCE(tr.number, ''),
    auth.uid()
  );

  -- Cache factor
  UPDATE public.inventory_transfers
  SET uom_factor = CASE
        WHEN v_stock_qty <> 0 AND tr.quantity <> 0
        THEN ROUND(v_stock_qty / tr.quantity, 8)
        ELSE 1
      END
  WHERE id = _transfer_id;

  UPDATE public.inventory_transfers
  SET status = 'Completed', posted_at = now()
  WHERE id = _transfer_id;

  INSERT INTO public.document_events
    (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (tr.tenant_id, 'transfer', tr.id, 'Completed',
    'Stock transferred between warehouses' ||
      CASE WHEN tr.uom IS NOT NULL AND tr.uom <> v_item.uom
           THEN ' (converted from ' || tr.uom || ' to ' || COALESCE(v_item.uom,'pc') || ')'
           ELSE '' END,
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _transfer_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_transfer_unchecked(uuid) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  post_production_order_unchecked  (UOM-aware replacement)
--
-- Changes vs previous version:
--   a) Each bom_line may have its own .uom; we convert to component stock UOM.
--   b) Production order .quantity may be in .quantity_uom; convert to FG stock UOM.
--   c) Component-source warehouse is now the production warehouse (existing
--      limitation noted in audit — fixing properly requires routing, deferred).
--   d) uom_factor cached on bom_lines and production_orders.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_production_order_unchecked(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  mo                    record;
  bm                    record;
  wh                    uuid;
  comp                  record;
  v_comp_item           record;
  v_fg_item             record;
  component_stock_qty   numeric(18,8);  -- component qty in component's stock UOM
  component_cost        numeric(14,4);
  total_component_cost  numeric(14,4) := 0;
  fg_stock_qty          numeric(18,8);  -- FG qty in FG stock UOM
  wip_acct              uuid;
  inv_acct              uuid;
  scale                 numeric(18,8);
BEGIN
  SELECT * INTO mo FROM public.production_orders WHERE id = _order_id AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.tenant_id <> public.current_tenant_id() AND NOT public.is_super_admin()
    THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF mo.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Production order already posted'; END IF;

  SELECT * INTO bm FROM public.bom_headers WHERE id = mo.bom_id AND deleted_at IS NULL;
  IF bm.id IS NULL THEN RAISE EXCEPTION 'BOM not found'; END IF;

  -- Resolve output warehouse
  wh := mo.warehouse_id;
  IF wh IS NULL THEN
    SELECT id INTO wh FROM public.warehouses
    WHERE tenant_id = mo.tenant_id AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;
  END IF;

  wip_acct := public._cfg_account(mo.tenant_id, 'wip');
  inv_acct := public._cfg_account(mo.tenant_id, 'inventory');

  -- ── Resolve FG quantity (production order → FG stock UOM) ──────────────────
  SELECT * INTO v_fg_item FROM public.items WHERE id = bm.product_id AND deleted_at IS NULL;

  fg_stock_qty := public._resolve_stock_qty(
    mo.quantity,
    COALESCE(mo.quantity_uom, v_fg_item.uom),
    bm.product_id,
    mo.tenant_id
  );

  -- Scale factor: how many BOM batches to run to produce fg_stock_qty FG units
  scale := fg_stock_qty / COALESCE(NULLIF(bm.yield_qty::numeric, 0), 1);

  -- Cache uom_factor on production order
  UPDATE public.production_orders
  SET uom_factor = CASE
        WHEN fg_stock_qty <> 0 AND mo.quantity <> 0
        THEN ROUND(fg_stock_qty / mo.quantity, 8)
        ELSE 1
      END
  WHERE id = _order_id;

  -- ── Consume components ──────────────────────────────────────────────────────
  FOR comp IN
    SELECT bl.*,
           i.cost       AS item_cost,
           i.uom        AS item_stock_uom,
           i.id         AS comp_item_id
    FROM public.bom_lines bl
    JOIN public.items i ON i.id = bl.item_id
    WHERE bl.bom_id = mo.bom_id
      AND bl.deleted_at IS NULL
      AND bl.item_id IS NOT NULL
  LOOP
    -- Resolve component qty (bom_line UOM → component stock UOM)
    component_stock_qty := public._resolve_stock_qty(
      comp.quantity * scale,
      COALESCE(comp.uom, comp.item_stock_uom),
      comp.comp_item_id,
      mo.tenant_id
    );

    component_cost := COALESCE(comp.item_cost, 0) * component_stock_qty;
    total_component_cost := total_component_cost + component_cost;

    -- Cache bom_line uom_factor (only once per line, not per scale — store raw)
    UPDATE public.bom_lines
    SET uom_factor = CASE
          WHEN comp.uom IS NOT NULL AND comp.uom <> comp.item_stock_uom
          THEN COALESCE(
            public.uom_convert_safe(1.0, comp.uom, comp.item_stock_uom, comp.comp_item_id, mo.tenant_id),
            1.0
          )
          ELSE 1.0
        END
    WHERE id = comp.id;

    INSERT INTO public.stock_movements (
      tenant_id, item_id, warehouse_id,
      quantity, unit_cost,
      uom, source_uom, source_quantity,
      ref_type, ref_id, note, created_by
    ) VALUES (
      mo.tenant_id, comp.item_id, wh,
      -component_stock_qty,
      COALESCE(comp.item_cost, 0),
      comp.item_stock_uom,
      COALESCE(comp.uom, comp.item_stock_uom),
      CASE WHEN comp.uom IS NOT NULL AND comp.uom <> comp.item_stock_uom
           THEN comp.quantity * scale ELSE NULL END,
      'production_consume', mo.id,
      'Consume for ' || COALESCE(mo.number, ''),
      auth.uid()
    );
  END LOOP;

  -- ── Receive finished good ───────────────────────────────────────────────────
  INSERT INTO public.stock_movements (
    tenant_id, item_id, warehouse_id,
    quantity, unit_cost,
    uom, source_uom, source_quantity,
    ref_type, ref_id, note, created_by
  ) VALUES (
    mo.tenant_id, bm.product_id, wh,
    fg_stock_qty,
    CASE WHEN fg_stock_qty > 0 THEN total_component_cost / fg_stock_qty ELSE 0 END,
    v_fg_item.uom,
    COALESCE(mo.quantity_uom, v_fg_item.uom),
    CASE WHEN mo.quantity_uom IS NOT NULL AND mo.quantity_uom <> v_fg_item.uom
         THEN mo.quantity ELSE NULL END,
    'production_receive', mo.id,
    'Produce ' || COALESCE(mo.number, ''),
    auth.uid()
  );

  -- ── Update FG average cost (per stock-UOM unit) ─────────────────────────────
  IF fg_stock_qty > 0 THEN
    UPDATE public.items
    SET cost = ROUND(total_component_cost / fg_stock_qty, 8)
    WHERE id = bm.product_id;
  END IF;

  -- ── WIP journal (two balanced entries) ─────────────────────────────────────
  IF total_component_cost > 0 AND wip_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    -- Entry 1: consume components → WIP (DR WIP, CR Inventory)
    PERFORM public._emit_journal(mo.tenant_id, CURRENT_DATE,
      'Consume components – ' || COALESCE(mo.number,''), 'production_order', mo.id,
      jsonb_build_array(
        jsonb_build_object('account_id', wip_acct, 'debit',  total_component_cost, 'credit', 0,                    'memo', 'WIP'),
        jsonb_build_object('account_id', inv_acct, 'debit',  0,                    'credit', total_component_cost, 'memo', 'Inventory – components consumed')
      )
    );
    -- Entry 2: receive FG from WIP (DR Inventory, CR WIP)
    PERFORM public._emit_journal(mo.tenant_id, CURRENT_DATE,
      'Receive finished goods – ' || COALESCE(mo.number,''), 'production_order', mo.id,
      jsonb_build_array(
        jsonb_build_object('account_id', inv_acct, 'debit',  total_component_cost, 'credit', 0,                    'memo', 'Inventory – finished goods'),
        jsonb_build_object('account_id', wip_acct, 'debit',  0,                    'credit', total_component_cost, 'memo', 'WIP cleared')
      )
    );
  END IF;

  UPDATE public.production_orders
  SET status = 'Completed', posted_at = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events
    (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (mo.tenant_id, 'production_order', mo.id, 'Completed',
    'Production completed; components consumed and finished goods received',
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_production_order_unchecked(uuid) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  bom_refresh_uom_factors(_bom_id)
--     RPC callable from the BOM editor to pre-compute uom_factor on all lines
--     so the shop-floor UI can show "stock-qty equivalent" without calling
--     uom_convert at display time.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bom_refresh_uom_factors(_bom_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.current_tenant_id();
  v_count   integer := 0;
  comp      record;
BEGIN
  IF NOT public.has_permission('manufacturing.update') THEN
    RAISE EXCEPTION 'Not authorized: manufacturing.update' USING ERRCODE = '42501';
  END IF;

  FOR comp IN
    SELECT bl.id, bl.item_id, bl.uom,
           i.uom AS item_stock_uom
    FROM public.bom_lines bl
    JOIN public.items i ON i.id = bl.item_id
    WHERE bl.bom_id = _bom_id
      AND bl.tenant_id = v_tenant
      AND bl.deleted_at IS NULL
      AND bl.item_id IS NOT NULL
  LOOP
    UPDATE public.bom_lines
    SET uom_factor = CASE
          WHEN comp.uom IS NOT NULL AND comp.uom <> comp.item_stock_uom
          THEN COALESCE(
            public.uom_convert_safe(1.0, comp.uom, comp.item_stock_uom, comp.item_id, v_tenant),
            1.0
          )
          ELSE 1.0
        END
    WHERE id = comp.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bom_refresh_uom_factors(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.bom_refresh_uom_factors(uuid) TO authenticated;
