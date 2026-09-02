-- =========================================================
-- Inventory Transaction System Hardening
--
-- Fixes found during forensic audit of the posting engine:
--
-- 1. validate_posting_target does not block status='Void'
--    (only 'voided' is blocked; 'void' — the UI display value
--    — passes through and allows re-posting).
--
-- 2. post_adjustment_unchecked / post_transfer_unchecked do
--    not eagerly validate item or warehouse tenant ownership
--    before writing stock movements. validate_posting_inventory
--    catches this post-hoc but after the INSERT has already
--    executed inside the same transaction.  Moving the checks
--    earlier gives clearer error messages and stops the INSERT
--    entirely.
--
-- 3. post_transfer_unchecked allows a self-transfer (same
--    warehouse for source and destination) which creates two
--    phantom, perfectly-cancelling stock movements with zero
--    net effect.
--
-- 4. post_transfer_unchecked allows a quantity of zero or
--    negative without raising. validate_posting_inventory only
--    fires after the movements are written.
--
-- 5. accounting.journal.create / accounting.create are never
--    granted to the inventory or manufacturing roles. While
--    _emit_journal is SECURITY DEFINER and bypasses RLS, any
--    future direct journal INSERT (or a code path that falls
--    outside _emit_journal) would fail silently.  Grant the
--    correct granular permission so the permission model
--    accurately reflects intent.
--
-- 6. Document numbering — add UNIQUE constraint on
--    (tenant_id, number) for both inventory_adjustments and
--    inventory_transfers to prevent duplicate numbers.
--
-- 7. inventory.void and manufacturing.void permission codes
--    are in the permissions table (seeded in 20260827160000)
--    and granted.  Confirm and re-seed idempotently.
--
-- 8. The immutability trigger does not protect stock_movements
--    (by design — movements are compensated, not mutated).
--    Add a trigger that prevents DELETE on stock_movements
--    (UPDATE is already conceptually forbidden by convention;
--    we enforce DELETE prevention to close the most dangerous
--    gap without breaking existing logic).
--
-- 9. post_production_order_unchecked does not verify that
--    each BOM component item belongs to the current tenant.
--    Add tenant ownership check inside the component loop.
--
-- 10. Document number auto-generation sequence function.
--     Provides generate_doc_number(tenant_id, prefix) for use
--     by DataModulePage / form defaults.
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: validate_posting_target — add 'void' (without 'd') to blocked list
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_posting_target(
  _table_name  text,
  _document_id uuid,
  _permission  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id  uuid;
  v_status     text;
  v_posted_at  timestamptz;
  v_deleted_at timestamptz;
BEGIN
  -- ── Permission check ────────────────────────────────────────────────────────
  IF NOT public.has_permission(_permission) THEN
    RAISE EXCEPTION 'Not authorized: %', _permission USING ERRCODE = '42501';
  END IF;

  -- ── Table whitelist ─────────────────────────────────────────────────────────
  IF _table_name NOT IN (
    'invoices', 'bills', 'credit_notes', 'shipments', 'packages',
    'inventory_adjustments', 'inventory_transfers', 'production_orders',
    'payments_received', 'payments_made', 'expenses'
  ) THEN
    RAISE EXCEPTION 'Unsupported posting document: %', _table_name;
  END IF;

  -- ── Fetch row with row-level lock (prevents double-posting race) ─────────────
  EXECUTE format(
    'SELECT tenant_id, status, posted_at, deleted_at
     FROM public.%I
     WHERE id = $1
     FOR UPDATE',
    _table_name
  )
  INTO v_tenant_id, v_status, v_posted_at, v_deleted_at
  USING _document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '% not found', _table_name;
  END IF;

  -- ── Tenant isolation ────────────────────────────────────────────────────────
  IF v_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant mismatch — document % belongs to a different tenant',
      _document_id USING ERRCODE = '42501';
  END IF;

  -- ── Soft-delete guard ────────────────────────────────────────────────────────
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION '% % has been deleted and cannot be posted', _table_name, _document_id;
  END IF;

  -- ── Idempotency: already posted ──────────────────────────────────────────────
  IF v_posted_at IS NOT NULL THEN
    RETURN false;  -- caller should return _document_id unchanged
  END IF;

  -- ── Status guard (FIX: added 'void' to the blocked list) ────────────────────
  -- 'void'   = the UI display value before the document is voided via void_posted_document
  -- 'voided' = status set by void_posted_document after voiding
  -- Both must be blocked.
  IF lower(COALESCE(v_status, '')) IN (
    'posted', 'completed',
    'cancelled', 'canceled',
    'voided', 'void',         -- FIX: 'void' added
    'rejected', 'reversed'
  ) THEN
    RAISE EXCEPTION '% % cannot be posted from status "%"',
      _table_name, _document_id, COALESCE(v_status, 'NULL');
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_posting_target(text, uuid, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2 + 3 + 4: post_adjustment_unchecked — eager validation
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
  v_warehouse   record;
  inv_acct      uuid;
  var_acct      uuid;
  v_stock_qty   numeric(18,8);
  v_unit_cost   numeric(14,4);
  val           numeric(14,2);
BEGIN
  -- ── 1. Fetch adjustment ──────────────────────────────────────────────────────
  SELECT * INTO adj
  FROM public.inventory_adjustments
  WHERE id = _adjustment_id AND deleted_at IS NULL;
  IF adj.id IS NULL THEN
    RAISE EXCEPTION 'Adjustment % not found', _adjustment_id;
  END IF;

  -- ── 2. Validate item exists and belongs to this tenant ───────────────────────
  SELECT * INTO v_item
  FROM public.items
  WHERE id = adj.item_id AND deleted_at IS NULL;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item % does not exist or has been deleted', adj.item_id;
  END IF;
  IF v_item.tenant_id <> adj.tenant_id THEN
    RAISE EXCEPTION 'Item % belongs to a different tenant', adj.item_id
      USING ERRCODE = '42501';
  END IF;

  -- ── 3. Validate warehouse exists and belongs to this tenant ─────────────────
  IF adj.warehouse_id IS NOT NULL THEN
    SELECT * INTO v_warehouse
    FROM public.warehouses
    WHERE id = adj.warehouse_id AND deleted_at IS NULL;
    IF v_warehouse.id IS NULL THEN
      RAISE EXCEPTION 'Warehouse % does not exist or has been deleted', adj.warehouse_id;
    END IF;
    IF v_warehouse.tenant_id <> adj.tenant_id THEN
      RAISE EXCEPTION 'Warehouse % belongs to a different tenant', adj.warehouse_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── 4. Validate quantity ─────────────────────────────────────────────────────
  IF adj.quantity IS NULL OR adj.quantity = 0 THEN
    RAISE EXCEPTION 'Adjustment quantity must be non-zero (got %)',
      COALESCE(adj.quantity::text, 'NULL');
  END IF;
  IF adj.quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'Adjustment quantity is not a valid number: %', adj.quantity;
  END IF;

  -- ── 5. UOM normalization ─────────────────────────────────────────────────────
  v_stock_qty := public._resolve_stock_qty(
    adj.quantity, adj.uom, adj.item_id, adj.tenant_id
  );

  IF v_stock_qty = 0 THEN
    RAISE EXCEPTION 'Resolved stock quantity is zero after UOM conversion (original: % %)',
      adj.quantity, COALESCE(adj.uom, v_item.uom);
  END IF;

  -- ── 6. Compute journal value ─────────────────────────────────────────────────
  v_unit_cost := COALESCE(v_item.cost, 0);
  val         := ROUND(v_stock_qty * v_unit_cost, 2);

  -- ── 7. Write stock movement ──────────────────────────────────────────────────
  INSERT INTO public.stock_movements (
    tenant_id, item_id, warehouse_id, location_id,
    quantity, unit_cost,
    uom, source_uom, source_quantity,
    ref_type, ref_id, note, created_by
  ) VALUES (
    adj.tenant_id, adj.item_id, adj.warehouse_id, adj.location_id,
    v_stock_qty, v_unit_cost,
    v_item.uom,
    COALESCE(adj.uom, v_item.uom),
    CASE WHEN adj.uom IS NOT NULL AND adj.uom <> v_item.uom
         THEN adj.quantity ELSE NULL END,
    'adjustment',
    adj.id,
    'Adjustment ' || COALESCE(adj.number, ''),
    auth.uid()
  );

  -- ── 8. Cache UOM factor ──────────────────────────────────────────────────────
  UPDATE public.inventory_adjustments
  SET uom_factor = CASE
        WHEN v_stock_qty <> 0 AND adj.quantity <> 0
        THEN ROUND(v_stock_qty / adj.quantity, 8)
        ELSE 1
      END
  WHERE id = _adjustment_id;

  -- ── 9. Journal entries ────────────────────────────────────────────────────────
  inv_acct := public._cfg_account(adj.tenant_id, 'inventory');
  var_acct := public._cfg_account(adj.tenant_id, 'inventory_variance');

  IF val <> 0 AND inv_acct IS NOT NULL AND var_acct IS NOT NULL THEN
    IF val > 0 THEN
      -- Stock in: DR Inventory / CR Variance
      PERFORM public._emit_journal(
        adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number, ''),
        'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', inv_acct, 'debit',  val, 'credit', 0,   'memo', 'Inventory IN'),
          jsonb_build_object('account_id', var_acct, 'debit',  0,   'credit', val, 'memo', 'Inventory variance CR')
        )
      );
    ELSE
      -- Stock out: DR Variance / CR Inventory
      PERFORM public._emit_journal(
        adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number, ''),
        'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', var_acct, 'debit',  ABS(val), 'credit', 0,        'memo', 'Inventory variance DR'),
          jsonb_build_object('account_id', inv_acct, 'debit',  0,        'credit', ABS(val), 'memo', 'Inventory OUT')
        )
      );
    END IF;
  END IF;

  -- ── 10. Finalise status ───────────────────────────────────────────────────────
  UPDATE public.inventory_adjustments
  SET status = 'Posted', posted_at = now()
  WHERE id = _adjustment_id;

  -- ── 11. Audit event ───────────────────────────────────────────────────────────
  INSERT INTO public.document_events
    (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (
    adj.tenant_id,
    'adjustment',
    adj.id,
    'Posted',
    'Inventory adjustment posted; ' ||
      CASE WHEN v_stock_qty > 0 THEN 'Stock IN' ELSE 'Stock OUT' END ||
      ' ' || ABS(v_stock_qty)::text || ' ' || COALESCE(v_item.uom, 'pc') ||
      CASE WHEN adj.uom IS NOT NULL AND adj.uom <> v_item.uom
           THEN ' (converted from ' || adj.quantity::text || ' ' || adj.uom || ')'
           ELSE '' END,
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  RETURN _adjustment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_adjustment_unchecked(uuid)
  FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 3 + 4: post_transfer_unchecked — self-transfer guard + eager validation
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
  v_from_wh     record;
  v_to_wh       record;
  v_stock_qty   numeric(18,8);
  v_unit_cost   numeric(14,4);
BEGIN
  -- ── 1. Fetch transfer ────────────────────────────────────────────────────────
  SELECT * INTO tr
  FROM public.inventory_transfers
  WHERE id = _transfer_id AND deleted_at IS NULL;
  IF tr.id IS NULL THEN
    RAISE EXCEPTION 'Transfer % not found', _transfer_id;
  END IF;

  -- ── 2. Validate item ──────────────────────────────────────────────────────────
  SELECT * INTO v_item
  FROM public.items
  WHERE id = tr.item_id AND deleted_at IS NULL;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item % does not exist or has been deleted', tr.item_id;
  END IF;
  IF v_item.tenant_id <> tr.tenant_id THEN
    RAISE EXCEPTION 'Item % belongs to a different tenant', tr.item_id
      USING ERRCODE = '42501';
  END IF;

  -- ── 3. Validate source warehouse ─────────────────────────────────────────────
  IF tr.from_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Source warehouse is required for a stock transfer';
  END IF;
  SELECT * INTO v_from_wh
  FROM public.warehouses
  WHERE id = tr.from_warehouse_id AND deleted_at IS NULL;
  IF v_from_wh.id IS NULL THEN
    RAISE EXCEPTION 'Source warehouse % does not exist or has been deleted', tr.from_warehouse_id;
  END IF;
  IF v_from_wh.tenant_id <> tr.tenant_id THEN
    RAISE EXCEPTION 'Source warehouse % belongs to a different tenant', tr.from_warehouse_id
      USING ERRCODE = '42501';
  END IF;

  -- ── 4. Validate destination warehouse ────────────────────────────────────────
  IF tr.to_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Destination warehouse is required for a stock transfer';
  END IF;
  SELECT * INTO v_to_wh
  FROM public.warehouses
  WHERE id = tr.to_warehouse_id AND deleted_at IS NULL;
  IF v_to_wh.id IS NULL THEN
    RAISE EXCEPTION 'Destination warehouse % does not exist or has been deleted', tr.to_warehouse_id;
  END IF;
  IF v_to_wh.tenant_id <> tr.tenant_id THEN
    RAISE EXCEPTION 'Destination warehouse % belongs to a different tenant', tr.to_warehouse_id
      USING ERRCODE = '42501';
  END IF;

  -- ── 5. FIX: Prevent self-transfer (same warehouse + same location) ───────────
  IF tr.from_warehouse_id = tr.to_warehouse_id
     AND tr.from_location_id IS NOT DISTINCT FROM tr.to_location_id THEN
    RAISE EXCEPTION
      'Transfer source and destination are identical '
      '(warehouse: %, location: %). '
      'A transfer requires different source and destination.',
      tr.from_warehouse_id,
      COALESCE(tr.from_location_id::text, 'none');
  END IF;

  -- ── 6. Validate quantity ─────────────────────────────────────────────────────
  IF tr.quantity IS NULL OR tr.quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be positive (got %)',
      COALESCE(tr.quantity::text, 'NULL');
  END IF;
  IF tr.quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'Transfer quantity is not a valid number: %', tr.quantity;
  END IF;

  -- ── 7. UOM normalization ──────────────────────────────────────────────────────
  v_stock_qty := public._resolve_stock_qty(
    tr.quantity, tr.uom, tr.item_id, tr.tenant_id
  );

  IF v_stock_qty <= 0 THEN
    RAISE EXCEPTION 'Resolved stock quantity must be positive (got % after UOM conversion)',
      v_stock_qty;
  END IF;

  v_unit_cost := COALESCE(v_item.cost, 0);

  -- ── 8. Write BOTH movements atomically in a single INSERT ────────────────────
  --     If this INSERT fails mid-way (e.g. FK violation on second row),
  --     the entire transaction rolls back — no partial posting.
  INSERT INTO public.stock_movements (
    tenant_id, item_id, warehouse_id, location_id,
    quantity, unit_cost,
    uom, source_uom, source_quantity,
    ref_type, ref_id, note, created_by
  ) VALUES
  -- Transfer OUT (negative) from source
  (
    tr.tenant_id, tr.item_id, tr.from_warehouse_id, tr.from_location_id,
    -v_stock_qty, v_unit_cost,
    v_item.uom,
    COALESCE(tr.uom, v_item.uom),
    CASE WHEN tr.uom IS NOT NULL AND tr.uom <> v_item.uom THEN tr.quantity ELSE NULL END,
    'transfer_out',
    tr.id,
    'Transfer OUT — ' || COALESCE(v_from_wh.name, tr.from_warehouse_id::text) ||
    CASE WHEN tr.from_location_id IS NOT NULL
         THEN ' [' || tr.from_location_id::text || ']' ELSE '' END ||
    ' → ' || COALESCE(v_to_wh.name, tr.to_warehouse_id::text),
    auth.uid()
  ),
  -- Transfer IN (positive) to destination
  (
    tr.tenant_id, tr.item_id, tr.to_warehouse_id, tr.to_location_id,
    v_stock_qty, v_unit_cost,
    v_item.uom,
    COALESCE(tr.uom, v_item.uom),
    CASE WHEN tr.uom IS NOT NULL AND tr.uom <> v_item.uom THEN tr.quantity ELSE NULL END,
    'transfer_in',
    tr.id,
    'Transfer IN — ' || COALESCE(v_from_wh.name, tr.from_warehouse_id::text) ||
    ' → ' || COALESCE(v_to_wh.name, tr.to_warehouse_id::text) ||
    CASE WHEN tr.to_location_id IS NOT NULL
         THEN ' [' || tr.to_location_id::text || ']' ELSE '' END,
    auth.uid()
  );

  -- ── 9. Cache UOM factor and mark Completed ────────────────────────────────────
  UPDATE public.inventory_transfers
  SET uom_factor = CASE
        WHEN v_stock_qty <> 0 AND tr.quantity <> 0
        THEN ROUND(v_stock_qty / tr.quantity, 8)
        ELSE 1
      END,
      status    = 'Completed',
      posted_at = now()
  WHERE id = _transfer_id;

  -- ── 10. Audit event ───────────────────────────────────────────────────────────
  INSERT INTO public.document_events
    (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (
    tr.tenant_id,
    'transfer',
    tr.id,
    'Completed',
    'Stock transfer posted: ' ||
    v_stock_qty::text || ' ' || COALESCE(v_item.uom, 'pc') ||
    ' of ' || v_item.name ||
    ' from ' || COALESCE(v_from_wh.name, tr.from_warehouse_id::text) ||
    ' to '   || COALESCE(v_to_wh.name,   tr.to_warehouse_id::text)   ||
    CASE WHEN tr.uom IS NOT NULL AND tr.uom <> v_item.uom
         THEN ' (converted from ' || tr.quantity::text || ' ' || tr.uom || ')'
         ELSE '' END,
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  RETURN _transfer_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_transfer_unchecked(uuid)
  FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 9: post_production_order_unchecked — add component tenant ownership check
-- ─────────────────────────────────────────────────────────────────────────────
-- The function is large; we add a guard at the component loop start without
-- changing any other logic.  The full body is reproduced to replace the prior
-- version cleanly.

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
  v_wh                  record;
  comp                  record;
  v_fg_item             record;
  component_stock_qty   numeric(18,8);
  component_cost        numeric(14,4);
  total_component_cost  numeric(14,4) := 0;
  fg_stock_qty          numeric(18,8);
  wip_acct              uuid;
  inv_acct              uuid;
  scale                 numeric(18,8);
BEGIN
  -- ── 1. Fetch production order ────────────────────────────────────────────────
  SELECT * INTO mo FROM public.production_orders WHERE id = _order_id AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order % not found', _order_id; END IF;
  IF mo.tenant_id <> public.current_tenant_id() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Production order % belongs to a different tenant', _order_id
      USING ERRCODE = '42501';
  END IF;
  IF mo.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Production order % is already posted', _order_id; END IF;

  -- ── 2. Validate BOM ──────────────────────────────────────────────────────────
  SELECT * INTO bm FROM public.bom_headers WHERE id = mo.bom_id AND deleted_at IS NULL;
  IF bm.id IS NULL THEN RAISE EXCEPTION 'BOM % not found or has been deleted', mo.bom_id; END IF;
  IF bm.tenant_id <> mo.tenant_id THEN
    RAISE EXCEPTION 'BOM % belongs to a different tenant', mo.bom_id USING ERRCODE = '42501';
  END IF;

  -- ── 3. Validate / resolve output warehouse ────────────────────────────────────
  wh := mo.warehouse_id;
  IF wh IS NULL THEN
    SELECT id INTO wh FROM public.warehouses
    WHERE tenant_id = mo.tenant_id AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;
    IF wh IS NULL THEN
      RAISE EXCEPTION 'No active warehouse found for tenant %', mo.tenant_id;
    END IF;
  ELSE
    SELECT * INTO v_wh FROM public.warehouses WHERE id = wh AND deleted_at IS NULL;
    IF v_wh.id IS NULL THEN
      RAISE EXCEPTION 'Output warehouse % does not exist or has been deleted', wh;
    END IF;
    IF v_wh.tenant_id <> mo.tenant_id THEN
      RAISE EXCEPTION 'Output warehouse % belongs to a different tenant', wh
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── 4. Validate production quantity ──────────────────────────────────────────
  IF mo.quantity IS NULL OR mo.quantity <= 0 THEN
    RAISE EXCEPTION 'Production order quantity must be positive (got %)',
      COALESCE(mo.quantity::text, 'NULL');
  END IF;

  -- ── 5. Resolve FG item and GL accounts ────────────────────────────────────────
  SELECT * INTO v_fg_item FROM public.items WHERE id = bm.product_id AND deleted_at IS NULL;
  IF v_fg_item.id IS NULL THEN
    RAISE EXCEPTION 'Finished-good item % not found', bm.product_id;
  END IF;
  IF v_fg_item.tenant_id <> mo.tenant_id THEN
    RAISE EXCEPTION 'Finished-good item % belongs to a different tenant', bm.product_id
      USING ERRCODE = '42501';
  END IF;

  wip_acct := public._cfg_account(mo.tenant_id, 'wip');
  inv_acct := public._cfg_account(mo.tenant_id, 'inventory');

  -- ── 6. Resolve FG qty in stock UOM ────────────────────────────────────────────
  fg_stock_qty := public._resolve_stock_qty(
    mo.quantity,
    COALESCE(mo.quantity_uom, v_fg_item.uom),
    bm.product_id,
    mo.tenant_id
  );

  IF fg_stock_qty <= 0 THEN
    RAISE EXCEPTION 'Resolved FG quantity must be positive (got %)', fg_stock_qty;
  END IF;

  scale := fg_stock_qty / COALESCE(NULLIF(bm.yield_qty::numeric, 0), 1);

  -- Cache uom_factor on production order
  UPDATE public.production_orders
  SET uom_factor = ROUND(fg_stock_qty / mo.quantity, 8)
  WHERE id = _order_id;

  -- ── 7. Consume components ─────────────────────────────────────────────────────
  FOR comp IN
    SELECT bl.*,
           i.cost       AS item_cost,
           i.uom        AS item_stock_uom,
           i.id         AS comp_item_id,
           i.tenant_id  AS comp_tenant_id,
           i.name       AS comp_name
    FROM public.bom_lines bl
    JOIN public.items i ON i.id = bl.item_id
    WHERE bl.bom_id    = mo.bom_id
      AND bl.deleted_at IS NULL
      AND bl.item_id   IS NOT NULL
  LOOP
    -- FIX 9: Validate component item belongs to the same tenant
    IF comp.comp_tenant_id <> mo.tenant_id THEN
      RAISE EXCEPTION
        'BOM component item "%" (%) belongs to a different tenant',
        comp.comp_name, comp.comp_item_id
        USING ERRCODE = '42501';
    END IF;

    -- Resolve component quantity to stock UOM
    component_stock_qty := public._resolve_stock_qty(
      comp.quantity * scale,
      COALESCE(comp.uom, comp.item_stock_uom),
      comp.comp_item_id,
      mo.tenant_id
    );

    component_cost := COALESCE(comp.item_cost, 0) * component_stock_qty;
    total_component_cost := total_component_cost + component_cost;

    -- Cache bom_line uom_factor
    UPDATE public.bom_lines
    SET uom_factor = CASE
          WHEN comp.uom IS NOT NULL AND comp.uom <> comp.item_stock_uom
          THEN COALESCE(
            public.uom_convert_safe(1.0, comp.uom, comp.item_stock_uom,
                                    comp.comp_item_id, mo.tenant_id),
            1.0
          )
          ELSE 1.0
        END
    WHERE id = comp.id;

    -- Write component consumption movement
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
      'production_consume',
      mo.id,
      'Consume for ' || COALESCE(mo.number, ''),
      auth.uid()
    );
  END LOOP;

  -- ── 8. Receive finished good ──────────────────────────────────────────────────
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
    'production_receive',
    mo.id,
    'Produce ' || COALESCE(mo.number, ''),
    auth.uid()
  );

  -- ── 9. Update FG average cost ─────────────────────────────────────────────────
  IF fg_stock_qty > 0 THEN
    UPDATE public.items
    SET cost = ROUND(total_component_cost / fg_stock_qty, 8)
    WHERE id = bm.product_id;
  END IF;

  -- ── 10. WIP journal (two balanced entries) ────────────────────────────────────
  IF total_component_cost > 0 AND wip_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    -- Entry 1: DR WIP / CR Inventory (components consumed)
    PERFORM public._emit_journal(
      mo.tenant_id, CURRENT_DATE,
      'Consume components – ' || COALESCE(mo.number, ''),
      'production_order', mo.id,
      jsonb_build_array(
        jsonb_build_object('account_id', wip_acct, 'debit',  total_component_cost,
                           'credit', 0, 'memo', 'WIP'),
        jsonb_build_object('account_id', inv_acct, 'debit',  0,
                           'credit', total_component_cost,
                           'memo', 'Inventory – components consumed')
      )
    );
    -- Entry 2: DR Inventory / CR WIP (finished goods received)
    PERFORM public._emit_journal(
      mo.tenant_id, CURRENT_DATE,
      'Receive finished goods – ' || COALESCE(mo.number, ''),
      'production_order', mo.id,
      jsonb_build_array(
        jsonb_build_object('account_id', inv_acct, 'debit',  total_component_cost,
                           'credit', 0, 'memo', 'Inventory – finished goods'),
        jsonb_build_object('account_id', wip_acct, 'debit',  0,
                           'credit', total_component_cost, 'memo', 'WIP cleared')
      )
    );
  END IF;

  -- ── 11. Finalise status ───────────────────────────────────────────────────────
  UPDATE public.production_orders
  SET status = 'Completed', posted_at = now()
  WHERE id = _order_id;

  -- ── 12. Audit event ───────────────────────────────────────────────────────────
  INSERT INTO public.document_events
    (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (
    mo.tenant_id,
    'production_order',
    mo.id,
    'Completed',
    'Production completed — ' ||
    fg_stock_qty::text || ' ' || COALESCE(v_fg_item.uom, 'pc') ||
    ' of ' || v_fg_item.name || ' produced; component cost ' ||
    total_component_cost::text,
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_production_order_unchecked(uuid)
  FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 5: Grant accounting.journal.create to inventory and manufacturing roles
--
-- Root cause: _emit_journal is SECURITY DEFINER so it bypasses RLS for the
-- current engine, but the permission model should accurately reflect intent.
-- Granting this permission ensures that if a code path ever calls
-- journal_entries INSERT directly (not via _emit_journal), the inventory and
-- manufacturing roles can still write journals during posting.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.role_permissions (role, permission_code)
SELECT r.role, p.code
FROM (VALUES ('inventory'), ('manufacturing')) AS r(role)
CROSS JOIN public.permissions p
WHERE p.code IN ('accounting.journal.create', 'accounting.create')
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 6: UNIQUE constraint on document numbers
--
-- Prevents duplicate adjustment/transfer numbers within a tenant.
-- Uses a partial unique index to allow NULL-excluded soft-deleted records.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS inventory_adjustments_tenant_number_uidx
  ON public.inventory_adjustments (tenant_id, number)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_transfers_tenant_number_uidx
  ON public.inventory_transfers (tenant_id, number)
  WHERE deleted_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 7: Idempotently confirm inventory.void / manufacturing.void exist
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('inventory.void',     'inventory',     'void',  'Void and reverse posted inventory documents'),
  ('manufacturing.void', 'manufacturing', 'void',  'Void and reverse posted production documents')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('inventory',     'inventory.void'),
  ('manufacturing', 'manufacturing.void')
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 8: Prevent DELETE on stock_movements (append-only ledger protection)
--
-- stock_movements is the authoritative inventory ledger.  No row should ever
-- be deleted — corrections must be represented as compensating movements.
-- UPDATE is left unguarded by trigger (the immutability trigger on document
-- tables handles the posting lock; the ledger itself is protected by the
-- convention that only SECURITY DEFINER functions write to it and none of
-- them UPDATE existing rows).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_stock_movements_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Stock movements are immutable. '
    'Row % in stock_movements cannot be deleted. '
    'Create a compensating movement (reversal) instead.',
    OLD.id
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_no_delete
  ON public.stock_movements;

CREATE TRIGGER trg_stock_movements_no_delete
  BEFORE DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_movements_no_delete();


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 10: Document number auto-generation helper
--
-- generate_doc_number(tenant_id, prefix) → text
--
-- Generates the next unique document number for a given prefix within a
-- tenant by atomically incrementing a counter in a helper table.
-- Example: generate_doc_number(tenant_id, 'ADJ') → 'ADJ-00042'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.doc_number_sequences (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  prefix     text        NOT NULL,
  next_value bigint      NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, prefix)
);

ALTER TABLE public.doc_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_number_sequences_tenant_read ON public.doc_number_sequences
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

-- Writes only via SECURITY DEFINER function
REVOKE INSERT, UPDATE, DELETE ON public.doc_number_sequences FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.doc_number_sequences TO authenticated;
GRANT  ALL    ON public.doc_number_sequences TO service_role;


CREATE OR REPLACE FUNCTION public.generate_doc_number(
  _tenant_id uuid,
  _prefix    text,
  _pad_width integer DEFAULT 5
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF _tenant_id IS DISTINCT FROM public.current_tenant_id()
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.doc_number_sequences (tenant_id, prefix, next_value)
  VALUES (_tenant_id, _prefix, 2)
  ON CONFLICT (tenant_id, prefix) DO UPDATE
    SET next_value = public.doc_number_sequences.next_value + 1
  RETURNING next_value - 1 INTO v_next;

  RETURN _prefix || '-' || lpad(v_next::text, _pad_width, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_doc_number(uuid, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_doc_number(uuid, text, integer) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Update validate_posting_inventory to also check location ownership
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_posting_inventory(
  _entity_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m                  record;
  v_item_tenant      uuid;
  v_warehouse_tenant uuid;
  v_location_tenant  uuid;
  v_prior_count      integer;
  v_balance          numeric;
  v_count            integer := 0;
BEGIN
  FOR m IN
    SELECT id, item_id, warehouse_id, location_id, quantity, unit_cost
    FROM public.stock_movements
    WHERE tenant_id = public.current_tenant_id()
      AND ref_id    = _entity_id
    FOR UPDATE
  LOOP
    v_count := v_count + 1;

    -- ── Quantity sanity ────────────────────────────────────────────────────────
    IF m.quantity IS NULL OR
       m.quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'Invalid inventory quantity on movement %', m.id;
    END IF;

    IF m.unit_cost IS NULL OR m.unit_cost < 0 OR
       m.unit_cost IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'Invalid inventory unit_cost on movement %', m.id;
    END IF;

    -- ── Item ownership ─────────────────────────────────────────────────────────
    SELECT tenant_id INTO v_item_tenant
    FROM public.items WHERE id = m.item_id AND deleted_at IS NULL;
    IF v_item_tenant IS NULL THEN
      RAISE EXCEPTION 'Inventory item % does not exist', m.item_id;
    END IF;
    IF v_item_tenant <> public.current_tenant_id() THEN
      RAISE EXCEPTION 'Inventory item % belongs to another tenant', m.item_id;
    END IF;

    -- ── Warehouse ownership ────────────────────────────────────────────────────
    IF m.warehouse_id IS NOT NULL THEN
      SELECT tenant_id INTO v_warehouse_tenant
      FROM public.warehouses WHERE id = m.warehouse_id AND deleted_at IS NULL;
      IF v_warehouse_tenant IS NULL THEN
        RAISE EXCEPTION 'Warehouse % does not exist', m.warehouse_id;
      END IF;
      IF v_warehouse_tenant <> public.current_tenant_id() THEN
        RAISE EXCEPTION 'Warehouse % belongs to another tenant', m.warehouse_id;
      END IF;
    END IF;

    -- ── Location ownership (new) ───────────────────────────────────────────────
    IF m.location_id IS NOT NULL THEN
      SELECT tenant_id INTO v_location_tenant
      FROM public.warehouse_locations WHERE id = m.location_id AND deleted_at IS NULL;
      IF v_location_tenant IS NULL THEN
        RAISE EXCEPTION 'Location % does not exist or has been deleted', m.location_id;
      END IF;
      IF v_location_tenant <> public.current_tenant_id() THEN
        RAISE EXCEPTION 'Location % belongs to another tenant', m.location_id;
      END IF;
    END IF;

    -- ── Negative balance check (outbound movements only) ──────────────────────
    IF m.quantity < 0 THEN
      SELECT COUNT(*) INTO v_prior_count
      FROM public.stock_movements
      WHERE tenant_id   = public.current_tenant_id()
        AND item_id     = m.item_id
        AND warehouse_id IS NOT DISTINCT FROM m.warehouse_id
        AND id          <> m.id;

      IF v_prior_count > 0 THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_balance
        FROM public.stock_movements
        WHERE tenant_id   = public.current_tenant_id()
          AND item_id     = m.item_id
          AND warehouse_id IS NOT DISTINCT FROM m.warehouse_id;

        IF v_balance < -0.0001 THEN
          RAISE EXCEPTION
            'Insufficient inventory for item % at warehouse % '
            '(ledger balance: %, after movement: %)',
            m.item_id,
            COALESCE(m.warehouse_id::text, 'unspecified'),
            v_balance - m.quantity,  -- balance before this movement
            v_balance;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_posting_inventory(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Update inventoryAdjustmentFields status options to match DB-set value
-- (no DB change needed — this is a frontend field definition note)
-- The DB function void_posted_document sets status = 'Voided' (with 'd').
-- The UI shows 'Void' (without 'd') as an option. These are now consistent:
-- 'Void' is the pre-void manual status (blocked by validate_posting_target).
-- 'Voided' is the machine-set status after void_posted_document completes.
-- Both are blocked by validate_posting_target. ✓
-- ─────────────────────────────────────────────────────────────────────────────

-- No SQL change needed here. The fix is in validate_posting_target above.
-- The comment documents the intent for future maintainers.

COMMENT ON FUNCTION public.validate_posting_target(text, uuid, text) IS
  'Pre-flight check for all posting operations. '
  'Validates: permission, table whitelist, tenant ownership, soft-delete, '
  'idempotency (already posted → returns false), status guard. '
  'Blocked statuses: posted, completed, cancelled, canceled, voided, void, rejected, reversed. '
  'Returns true = proceed, false = already posted (idempotent).';

COMMENT ON FUNCTION public.post_adjustment_unchecked(uuid) IS
  'Internal posting function for inventory adjustments. '
  'Validates: item exists + tenant, warehouse exists + tenant, '
  'quantity non-zero/non-NaN. Creates stock movement + GL journal. '
  'NEVER call directly — use post_adjustment() which adds permission + status checks.';

COMMENT ON FUNCTION public.post_transfer_unchecked(uuid) IS
  'Internal posting function for inventory transfers. '
  'Validates: item, source/dest warehouses exist + tenant, '
  'prevents self-transfer, quantity positive. '
  'Creates two balanced stock movements atomically (OUT + IN). '
  'No GL journal — transfers are internal movements. '
  'NEVER call directly — use post_transfer().';

COMMENT ON FUNCTION public.post_production_order_unchecked(uuid) IS
  'Internal posting function for production orders. '
  'Validates: order, BOM, output warehouse, FG item, all component items '
  'belong to the same tenant. '
  'Creates component consumption movements + FG receipt movement + WIP journals. '
  'NEVER call directly — use post_production_order().';
