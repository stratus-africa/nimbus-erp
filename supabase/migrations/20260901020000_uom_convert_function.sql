-- =========================================================
-- UOM Conversion Engine
--
-- 1. uom_convert()          — safe numeric conversion using NUMERIC(18,8)
-- 2. uom_convert_safe()     — same but returns NULL instead of raising
-- 3. trg_uom_no_circular()  — trigger preventing circular conversion chains
-- 4. trg_uom_class_compat() — trigger preventing cross-class conversions
-- 5. Schema additions:
--      stock_movements.uom        (audit trail of original UOM)
--      inventory_adjustments.uom  (document UOM; may differ from stock UOM)
--      inventory_transfers.uom
--      bom_lines.uom              (component quantity UOM)
--      production_orders.quantity_uom
--
-- Precision strategy:
--   All intermediate arithmetic uses NUMERIC(18,8) — 8 decimal places give
--   sub-microgram precision for Weight, sub-millimetre for Length.
--   Final results are ROUND()ed to NUMERIC(18,8) before storage.
--   Stock movements always store quantity in the item's STOCK UOM.
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  uom_convert(_qty, _from, _to, _item_id, _tenant_id)
--
-- Resolves the conversion path:
--   a) Direct:   look up uom_conversions WHERE from_uom=_from AND to_uom=_to
--                (item-specific first, then global NULL fallback)
--   b) Via base: find base unit for the class, convert from→base, base→to
--
-- Raises EXCEPTION if no path exists or classes are incompatible.
-- Returns NUMERIC(18,8).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.uom_convert(
  _qty       numeric,
  _from      text,
  _to        text,
  _item_id   uuid    DEFAULT NULL,
  _tenant_id uuid    DEFAULT NULL
)
RETURNS numeric(18,8)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant      uuid   := COALESCE(_tenant_id, public.current_tenant_id());
  v_factor      numeric(18,8);
  v_from_class  text;
  v_to_class    text;
  v_base        text;
  v_factor_fwd  numeric(18,8);   -- _from  → base
  v_factor_rev  numeric(18,8);   -- base   → _to
BEGIN
  -- Trivial identity conversion
  IF _from = _to THEN
    RETURN ROUND(_qty::numeric(18,8), 8);
  END IF;

  -- ── a. Direct conversion (item-specific takes priority) ────────────────────
  SELECT factor INTO v_factor
  FROM public.uom_conversions
  WHERE tenant_id = v_tenant
    AND from_uom  = _from
    AND to_uom    = _to
    AND deleted_at IS NULL
    AND (item_id = _item_id OR item_id IS NULL)
  ORDER BY (item_id IS NOT NULL) DESC  -- item-specific first
  LIMIT 1;

  IF v_factor IS NOT NULL THEN
    RETURN ROUND(_qty * v_factor, 8);
  END IF;

  -- ── b. Resolve via base unit ───────────────────────────────────────────────

  -- Get UOM class of source and target
  SELECT uom_class INTO v_from_class
  FROM public.units_of_measure
  WHERE tenant_id = v_tenant AND code = _from AND deleted_at IS NULL
  LIMIT 1;

  SELECT uom_class INTO v_to_class
  FROM public.units_of_measure
  WHERE tenant_id = v_tenant AND code = _to AND deleted_at IS NULL
  LIMIT 1;

  IF v_from_class IS NULL THEN
    RAISE EXCEPTION 'UOM "%" not found in master list for this tenant', _from
      USING ERRCODE = 'P0001';
  END IF;
  IF v_to_class IS NULL THEN
    RAISE EXCEPTION 'UOM "%" not found in master list for this tenant', _to
      USING ERRCODE = 'P0001';
  END IF;

  -- Class-compatibility guard
  IF v_from_class <> v_to_class THEN
    RAISE EXCEPTION 'Cannot convert between different UOM classes: "%" (%) → "%" (%)',
      _from, v_from_class, _to, v_to_class
      USING ERRCODE = 'P0002';
  END IF;

  -- Find the base unit for this class
  SELECT code INTO v_base
  FROM public.units_of_measure
  WHERE tenant_id = v_tenant
    AND uom_class = v_from_class
    AND is_base_unit = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_base IS NULL THEN
    RAISE EXCEPTION 'No base unit defined for UOM class "%" — define one in Units of Measure settings',
      v_from_class
      USING ERRCODE = 'P0001';
  END IF;

  -- _from → base
  IF _from = v_base THEN
    v_factor_fwd := 1.0;
  ELSE
    SELECT factor INTO v_factor_fwd
    FROM public.uom_conversions
    WHERE tenant_id = v_tenant
      AND from_uom  = _from
      AND to_uom    = v_base
      AND deleted_at IS NULL
      AND (item_id = _item_id OR item_id IS NULL)
    ORDER BY (item_id IS NOT NULL) DESC
    LIMIT 1;

    IF v_factor_fwd IS NULL THEN
      RAISE EXCEPTION 'No conversion path from "%" to base unit "%" (class: %)',
        _from, v_base, v_from_class
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- base → _to
  IF v_to = v_base THEN
    v_factor_rev := 1.0;
  ELSE
    SELECT factor INTO v_factor_rev
    FROM public.uom_conversions
    WHERE tenant_id = v_tenant
      AND from_uom  = v_base
      AND to_uom    = _to
      AND deleted_at IS NULL
      AND (item_id = _item_id OR item_id IS NULL)
    ORDER BY (item_id IS NOT NULL) DESC
    LIMIT 1;

    IF v_factor_rev IS NULL THEN
      RAISE EXCEPTION 'No conversion path from base unit "%" to "%" (class: %)',
        v_base, _to, v_from_class
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN ROUND(_qty * v_factor_fwd * v_factor_rev, 8);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.uom_convert(numeric, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.uom_convert(numeric, text, text, uuid, uuid) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  uom_convert_safe — NULL-returning variant for use in expressions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.uom_convert_safe(
  _qty       numeric,
  _from      text,
  _to        text,
  _item_id   uuid    DEFAULT NULL,
  _tenant_id uuid    DEFAULT NULL
)
RETURNS numeric(18,8)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.uom_convert(_qty, _from, _to, _item_id, _tenant_id);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.uom_convert_safe(numeric, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.uom_convert_safe(numeric, text, text, uuid, uuid) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  uom_has_path(_from, _to, _item_id, _tenant_id) → boolean
--     Lightweight check — used by the frontend to validate UOM selection
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.uom_has_path(
  _from      text,
  _to        text,
  _item_id   uuid    DEFAULT NULL,
  _tenant_id uuid    DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Trivial
  IF _from = _to THEN RETURN true; END IF;
  -- Try convert 1; if it raises we return false
  PERFORM public.uom_convert(1.0, _from, _to, _item_id, _tenant_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.uom_has_path(text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.uom_has_path(text, text, uuid, uuid) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  Circular-conversion guard trigger on uom_conversions
--
--     Prevents inserting A→B when B→A already exists via any path,
--     which would create an inconsistent loop (factor × reciprocal ≠ 1).
--     Uses a depth-limited BFS (max 6 hops) to detect cycles.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_uom_no_circular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- We check: does a path already exist from NEW.to_uom back to NEW.from_uom?
  -- If yes, this new row would create a cycle.
  v_cycle boolean;
BEGIN
  -- Identity conversions are meaningless but not circular — reject them cleanly
  IF NEW.from_uom = NEW.to_uom THEN
    RAISE EXCEPTION 'A unit cannot convert to itself (from_uom = to_uom = "%")', NEW.from_uom
      USING ERRCODE = 'P0003';
  END IF;

  -- BFS: start from NEW.to_uom, follow edges in uom_conversions, see if we
  -- can reach NEW.from_uom in ≤ 6 hops (sufficient for any realistic chain).
  WITH RECURSIVE paths(current_uom, depth) AS (
    -- seed: all direct targets from NEW.to_uom
    SELECT c.to_uom, 1
    FROM public.uom_conversions c
    WHERE c.tenant_id  = NEW.tenant_id
      AND c.from_uom   = NEW.to_uom
      AND c.deleted_at IS NULL
      AND (c.item_id = NEW.item_id OR c.item_id IS NULL OR NEW.item_id IS NULL)
    UNION
    -- recurse
    SELECT c.to_uom, p.depth + 1
    FROM paths p
    JOIN public.uom_conversions c
      ON c.from_uom   = p.current_uom
     AND c.tenant_id  = NEW.tenant_id
     AND c.deleted_at IS NULL
     AND (c.item_id = NEW.item_id OR c.item_id IS NULL OR NEW.item_id IS NULL)
    WHERE p.depth < 6
  )
  SELECT EXISTS (
    SELECT 1 FROM paths WHERE current_uom = NEW.from_uom
  ) INTO v_cycle;

  IF v_cycle THEN
    RAISE EXCEPTION 'Circular conversion detected: adding "%" → "%" would create a cycle',
      NEW.from_uom, NEW.to_uom
      USING ERRCODE = 'P0003';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uom_conversions_no_circular ON public.uom_conversions;
CREATE TRIGGER trg_uom_conversions_no_circular
  BEFORE INSERT OR UPDATE ON public.uom_conversions
  FOR EACH ROW EXECUTE FUNCTION public.trg_uom_no_circular();


-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  Class-compatibility guard trigger on uom_conversions
--
--     Both from_uom and to_uom must exist in units_of_measure with the SAME
--     uom_class, or item_id-specific conversions (Packaging) are allowed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_uom_class_compat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from_class text;
  v_to_class   text;
BEGIN
  -- Skip class check for item-specific conversions that cross Packaging→base
  -- (e.g. 1 Box = 12 Pieces: Packaging → Unit is explicitly allowed when
  --  item_id IS NOT NULL, because packaging is item-specific).
  IF NEW.item_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT uom_class INTO v_from_class
  FROM public.units_of_measure
  WHERE tenant_id = NEW.tenant_id AND code = NEW.from_uom AND deleted_at IS NULL
  LIMIT 1;

  SELECT uom_class INTO v_to_class
  FROM public.units_of_measure
  WHERE tenant_id = NEW.tenant_id AND code = NEW.to_uom AND deleted_at IS NULL
  LIMIT 1;

  -- If either UOM is not yet in the master list, allow the insert (could be
  -- a custom code being bootstrapped).
  IF v_from_class IS NULL OR v_to_class IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_from_class <> v_to_class THEN
    RAISE EXCEPTION
      'Global conversion "%" (%) → "%" (%) crosses UOM classes. '
      'Cross-class conversions are only allowed on item-specific conversions.',
      NEW.from_uom, v_from_class, NEW.to_uom, v_to_class
      USING ERRCODE = 'P0002';
  END IF;

  -- Stamp uom_class on the row for easy querying
  NEW.uom_class := v_from_class;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uom_conversions_class_compat ON public.uom_conversions;
CREATE TRIGGER trg_uom_conversions_class_compat
  BEFORE INSERT OR UPDATE ON public.uom_conversions
  FOR EACH ROW EXECUTE FUNCTION public.trg_uom_class_compat();


-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  Schema additions: UOM tracking columns on transaction tables
--
--     These columns record the UOM that the user ENTERED the quantity in.
--     The posting functions will convert to stock UOM before writing
--     stock_movements.  All columns are nullable so existing rows are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- stock_movements: audit — which UOM was the original entry in?
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS uom              text,   -- stock UOM (informational)
  ADD COLUMN IF NOT EXISTS source_uom       text,   -- UOM the document was entered in
  ADD COLUMN IF NOT EXISTS source_quantity  numeric(18,8);
  -- source_quantity: the original qty before normalization; NULL means it was already in stock UOM

-- inventory_adjustments
ALTER TABLE public.inventory_adjustments
  ADD COLUMN IF NOT EXISTS uom        text,    -- UOM the adjustment quantity is in (defaults to item stock UOM)
  ADD COLUMN IF NOT EXISTS uom_factor numeric(18,8); -- factor applied: stock_qty = quantity * uom_factor

-- inventory_transfers
ALTER TABLE public.inventory_transfers
  ADD COLUMN IF NOT EXISTS uom        text,
  ADD COLUMN IF NOT EXISTS uom_factor numeric(18,8);

-- bom_lines: component quantity may be stated in any UOM convertible to stock UOM
ALTER TABLE public.bom_lines
  ADD COLUMN IF NOT EXISTS uom        text,    -- UOM the component quantity is specified in
  ADD COLUMN IF NOT EXISTS uom_factor numeric(18,8); -- pre-computed at BOM save time; refreshed on post

-- production_orders: production quantity UOM (usually item's manufacturing_uom)
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS quantity_uom  text,
  ADD COLUMN IF NOT EXISTS uom_factor    numeric(18,8);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  Index new columns for common filter patterns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_stock_movements_source_uom
  ON public.stock_movements(tenant_id, source_uom)
  WHERE source_uom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bom_lines_uom
  ON public.bom_lines(uom)
  WHERE uom IS NOT NULL;
