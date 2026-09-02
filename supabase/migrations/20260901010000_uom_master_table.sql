-- =========================================================
-- UOM Master Table
--
-- Creates a proper units_of_measure master reference table
-- that backs the /settings/uom page and provides FK targets
-- for items.uom / purchase_uom / sales_uom / manufacturing_uom.
--
-- Design decisions:
--   • Each UOM has a uom_class (Unit | Weight | Length | Volume |
--     Area | Time | Packaging) to prevent nonsensical cross-class
--     conversions (e.g. kg → metres).
--   • is_base_unit marks the canonical reference unit within a
--     class (e.g. pc for Unit, kg for Weight). The conversion
--     engine normalises through the base unit.
--   • Items retain text columns for UOM codes for backward
--     compatibility; we add soft FK-style CHECK guidance via
--     triggers rather than hard FKs to avoid breakage if a UOM
--     is later deactivated.
--   • uom_conversions.factor column is widened to numeric(18,8)
--     to support precision like 1 oz = 0.02834952 kg.
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  units_of_measure
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.units_of_measure (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code         text        NOT NULL,   -- short code shown in UI, e.g. "kg", "box"
  name         text        NOT NULL,   -- full name, e.g. "Kilogram", "Box of 12"
  uom_class    text        NOT NULL    -- Unit | Weight | Length | Volume | Area | Time | Packaging
                           CHECK (uom_class IN (
                             'Unit','Weight','Length','Volume','Area','Time','Packaging'
                           )),
  is_base_unit boolean     NOT NULL DEFAULT false,
  -- base unit within the class (e.g. pc for Unit, kg for Weight, m for Length)
  symbol       text,                  -- optional display symbol, e.g. "kg", "m²"
  decimal_places integer  NOT NULL DEFAULT 2
                           CHECK (decimal_places BETWEEN 0 AND 8),
  -- how many decimal places quantities in this UOM are shown to
  is_active    boolean     NOT NULL DEFAULT true,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS uom_master_tenant_idx
  ON public.units_of_measure(tenant_id)
  WHERE deleted_at IS NULL AND is_active;

CREATE TRIGGER trg_uom_master_updated
  BEFORE UPDATE ON public.units_of_measure
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;

CREATE POLICY uom_master_tenant_read ON public.units_of_measure
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY uom_master_tenant_insert ON public.units_of_measure
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id()
              AND public.has_permission('inventory.create'));

CREATE POLICY uom_master_tenant_update ON public.units_of_measure
  FOR UPDATE TO authenticated
  USING  (tenant_id = public.current_tenant_id()
          AND public.has_permission('inventory.update'))
  WITH CHECK (tenant_id = public.current_tenant_id()
              AND public.has_permission('inventory.update'));

CREATE POLICY uom_master_tenant_delete ON public.units_of_measure
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND public.has_permission('inventory.delete'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  Seed default UOMs for every existing tenant
--     (new tenants get these via handle_new_user update in step 3)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.units_of_measure
  (tenant_id, code, name, uom_class, is_base_unit, symbol, decimal_places)
SELECT
  t.id,
  u.code,
  u.name,
  u.uom_class,
  u.is_base_unit,
  u.symbol,
  u.decimal_places
FROM public.tenants t
CROSS JOIN (VALUES
  -- ── Unit (discrete countable items) ────────────────────────────────
  ('pc',    'Piece',            'Unit',       true,  'pc',   0),
  ('pcs',   'Pieces',           'Unit',       false, 'pcs',  0),
  ('doz',   'Dozen',            'Unit',       false, 'doz',  0),
  ('pair',  'Pair',             'Unit',       false, 'pr',   0),
  ('set',   'Set',              'Unit',       false, 'set',  0),
  -- ── Weight ──────────────────────────────────────────────────────────
  ('kg',    'Kilogram',         'Weight',     true,  'kg',   3),
  ('g',     'Gram',             'Weight',     false, 'g',    3),
  ('mg',    'Milligram',        'Weight',     false, 'mg',   3),
  ('lb',    'Pound',            'Weight',     false, 'lb',   3),
  ('oz',    'Ounce',            'Weight',     false, 'oz',   3),
  ('t',     'Metric Ton',       'Weight',     false, 't',    3),
  -- ── Length ──────────────────────────────────────────────────────────
  ('m',     'Metre',            'Length',     true,  'm',    3),
  ('cm',    'Centimetre',       'Length',     false, 'cm',   2),
  ('mm',    'Millimetre',       'Length',     false, 'mm',   2),
  ('km',    'Kilometre',        'Length',     false, 'km',   3),
  ('in',    'Inch',             'Length',     false, 'in',   3),
  ('ft',    'Foot',             'Length',     false, 'ft',   3),
  ('yd',    'Yard',             'Length',     false, 'yd',   3),
  -- ── Volume ──────────────────────────────────────────────────────────
  ('l',     'Litre',            'Volume',     true,  'L',    3),
  ('ml',    'Millilitre',       'Volume',     false, 'mL',   3),
  ('cl',    'Centilitre',       'Volume',     false, 'cL',   3),
  ('gal',   'Gallon (US)',      'Volume',     false, 'gal',  3),
  ('fl_oz', 'Fluid Ounce (US)', 'Volume',     false, 'fl oz',3),
  -- ── Area ────────────────────────────────────────────────────────────
  ('m2',    'Square Metre',     'Area',       true,  'm²',   3),
  ('cm2',   'Square Centimetre','Area',       false, 'cm²',  3),
  ('ft2',   'Square Foot',      'Area',       false, 'ft²',  3),
  -- ── Time ────────────────────────────────────────────────────────────
  ('hr',    'Hour',             'Time',       true,  'hr',   2),
  ('min',   'Minute',           'Time',       false, 'min',  2),
  ('day',   'Day',              'Time',       false, 'day',  2),
  ('wk',    'Week',             'Time',       false, 'wk',   2),
  -- ── Packaging ───────────────────────────────────────────────────────
  ('box',   'Box',              'Packaging',  false, 'box',  0),
  ('ctn',   'Carton',           'Packaging',  false, 'ctn',  0),
  ('pkt',   'Packet',           'Packaging',  false, 'pkt',  0),
  ('pack',  'Pack',             'Packaging',  false, 'pack', 0),
  ('roll',  'Roll',             'Packaging',  false, 'roll', 2),
  ('sheet', 'Sheet',            'Packaging',  false, 'sheet',0),
  ('bag',   'Bag',              'Packaging',  false, 'bag',  0),
  ('can',   'Can',              'Packaging',  false, 'can',  0),
  ('bottle','Bottle',           'Packaging',  false, 'btl',  0),
  ('drum',  'Drum',             'Packaging',  false, 'drum', 0),
  ('pallet','Pallet',           'Packaging',  false, 'plt',  0)
) AS u(code, name, uom_class, is_base_unit, symbol, decimal_places)
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Seed global system-level UOM conversions for each tenant
--     These are dimension-safe (within-class only).
--     All factors: 1 from_uom = factor × to_uom (to the base unit)
-- ─────────────────────────────────────────────────────────────────────────────

-- Widen factor column to proper precision before seeding
ALTER TABLE public.uom_conversions
  ALTER COLUMN factor TYPE numeric(18,8);

-- Add uom_class to conversions so the guard function can validate
ALTER TABLE public.uom_conversions
  ADD COLUMN IF NOT EXISTS uom_class text
  CHECK (uom_class IN ('Unit','Weight','Length','Volume','Area','Time','Packaging'));

-- Seed standard within-class conversions (item_id = NULL = global)
INSERT INTO public.uom_conversions
  (tenant_id, item_id, from_uom, to_uom, factor, uom_class)
SELECT
  t.id,
  NULL,
  c.from_uom,
  c.to_uom,
  c.factor,
  c.uom_class
FROM public.tenants t
CROSS JOIN (VALUES
  -- Weight → kg (base)
  ('g',     'kg',    0.001,           'Weight'),
  ('mg',    'kg',    0.000001,        'Weight'),
  ('lb',    'kg',    0.45359237,      'Weight'),
  ('oz',    'kg',    0.02834952,      'Weight'),
  ('t',     'kg',    1000.0,          'Weight'),
  -- kg → others (reciprocals, useful for display)
  ('kg',    'g',     1000.0,          'Weight'),
  ('kg',    'lb',    2.20462262,      'Weight'),
  -- Length → m (base)
  ('cm',    'm',     0.01,            'Length'),
  ('mm',    'm',     0.001,           'Length'),
  ('km',    'm',     1000.0,          'Length'),
  ('in',    'm',     0.0254,          'Length'),
  ('ft',    'm',     0.3048,          'Length'),
  ('yd',    'm',     0.9144,          'Length'),
  -- m → others
  ('m',     'cm',    100.0,           'Length'),
  ('m',     'mm',    1000.0,          'Length'),
  ('m',     'ft',    3.28083990,      'Length'),
  -- Volume → l (base)
  ('ml',    'l',     0.001,           'Volume'),
  ('cl',    'l',     0.01,            'Volume'),
  ('gal',   'l',     3.78541178,      'Volume'),
  ('fl_oz', 'l',     0.02957353,      'Volume'),
  -- l → others
  ('l',     'ml',    1000.0,          'Volume'),
  -- Area → m2 (base)
  ('cm2',   'm2',    0.0001,          'Area'),
  ('ft2',   'm2',    0.09290304,      'Area'),
  -- Time → hr (base)
  ('min',   'hr',    0.01666667,      'Time'),
  ('day',   'hr',    24.0,            'Time'),
  ('wk',    'hr',    168.0,           'Time'),
  -- Unit aliases (exact)
  ('pcs',   'pc',    1.0,             'Unit'),
  ('doz',   'pc',    12.0,            'Unit'),
  ('pair',  'pc',    2.0,             'Unit')
) AS c(from_uom, to_uom, factor, uom_class)
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, item_id, from_uom, to_uom) DO UPDATE
  SET factor    = EXCLUDED.factor,
      uom_class = EXCLUDED.uom_class;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  Update handle_new_user() to seed UOMs for new tenants
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  tenant_name   text;
  tenant_slug   text;
BEGIN
  tenant_name := COALESCE(
    NEW.raw_user_meta_data->>'company',
    split_part(NEW.email,'@',1) || '''s Workspace'
  );
  tenant_slug := lower(regexp_replace(
    tenant_name || '-' || substr(NEW.id::text,1,8),
    '[^a-z0-9]+','-','g'
  ));

  INSERT INTO public.tenants (name, slug) VALUES (tenant_name, tenant_slug)
    RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, new_tenant_id, NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'tenant_admin');

  -- Default chart of accounts
  INSERT INTO public.chart_of_accounts
    (tenant_id, code, name, type, created_by) VALUES
    (new_tenant_id,'1000','Cash',                'Asset',   NEW.id),
    (new_tenant_id,'1100','Accounts Receivable', 'Asset',   NEW.id),
    (new_tenant_id,'1200','Inventory',           'Asset',   NEW.id),
    (new_tenant_id,'1300','Work in Progress',    'Asset',   NEW.id),
    (new_tenant_id,'2000','Accounts Payable',    'Liability',NEW.id),
    (new_tenant_id,'3000','Owner Equity',        'Equity',  NEW.id),
    (new_tenant_id,'4000','Sales Revenue',       'Income',  NEW.id),
    (new_tenant_id,'5000','Cost of Goods Sold',  'Expense', NEW.id),
    (new_tenant_id,'6000','Operating Expenses',  'Expense', NEW.id);

  -- Default item categories
  INSERT INTO public.item_categories (tenant_id, name, code) VALUES
    (new_tenant_id,'Finished Goods', 'FG'),
    (new_tenant_id,'Raw Materials',  'RM'),
    (new_tenant_id,'Packaging',      'PKG'),
    (new_tenant_id,'Consumables',    'CONS'),
    (new_tenant_id,'Spare Parts',    'SPARE'),
    (new_tenant_id,'Services',       'SVC')
  ON CONFLICT DO NOTHING;

  -- Default units of measure
  INSERT INTO public.units_of_measure
    (tenant_id, code, name, uom_class, is_base_unit, symbol, decimal_places) VALUES
    -- Unit
    (new_tenant_id,'pc',    'Piece',            'Unit',      true,  'pc',    0),
    (new_tenant_id,'pcs',   'Pieces',           'Unit',      false, 'pcs',   0),
    (new_tenant_id,'doz',   'Dozen',            'Unit',      false, 'doz',   0),
    (new_tenant_id,'pair',  'Pair',             'Unit',      false, 'pr',    0),
    (new_tenant_id,'set',   'Set',              'Unit',      false, 'set',   0),
    -- Weight
    (new_tenant_id,'kg',    'Kilogram',         'Weight',    true,  'kg',    3),
    (new_tenant_id,'g',     'Gram',             'Weight',    false, 'g',     3),
    (new_tenant_id,'lb',    'Pound',            'Weight',    false, 'lb',    3),
    (new_tenant_id,'oz',    'Ounce',            'Weight',    false, 'oz',    3),
    (new_tenant_id,'t',     'Metric Ton',       'Weight',    false, 't',     3),
    -- Length
    (new_tenant_id,'m',     'Metre',            'Length',    true,  'm',     3),
    (new_tenant_id,'cm',    'Centimetre',       'Length',    false, 'cm',    2),
    (new_tenant_id,'mm',    'Millimetre',       'Length',    false, 'mm',    2),
    (new_tenant_id,'in',    'Inch',             'Length',    false, 'in',    3),
    (new_tenant_id,'ft',    'Foot',             'Length',    false, 'ft',    3),
    -- Volume
    (new_tenant_id,'l',     'Litre',            'Volume',    true,  'L',     3),
    (new_tenant_id,'ml',    'Millilitre',       'Volume',    false, 'mL',    3),
    (new_tenant_id,'gal',   'Gallon (US)',      'Volume',    false, 'gal',   3),
    -- Area
    (new_tenant_id,'m2',    'Square Metre',     'Area',      true,  'm²',    3),
    (new_tenant_id,'ft2',   'Square Foot',      'Area',      false, 'ft²',   3),
    -- Time
    (new_tenant_id,'hr',    'Hour',             'Time',      true,  'hr',    2),
    (new_tenant_id,'min',   'Minute',           'Time',      false, 'min',   2),
    (new_tenant_id,'day',   'Day',              'Time',      false, 'day',   2),
    -- Packaging
    (new_tenant_id,'box',   'Box',              'Packaging', false, 'box',   0),
    (new_tenant_id,'ctn',   'Carton',           'Packaging', false, 'ctn',   0),
    (new_tenant_id,'pkt',   'Packet',           'Packaging', false, 'pkt',   0),
    (new_tenant_id,'pack',  'Pack',             'Packaging', false, 'pack',  0),
    (new_tenant_id,'roll',  'Roll',             'Packaging', false, 'roll',  2),
    (new_tenant_id,'sheet', 'Sheet',            'Packaging', false, 'sheet', 0),
    (new_tenant_id,'bag',   'Bag',              'Packaging', false, 'bag',   0),
    (new_tenant_id,'bottle','Bottle',           'Packaging', false, 'btl',   0),
    (new_tenant_id,'drum',  'Drum',             'Packaging', false, 'drum',  0),
    (new_tenant_id,'pallet','Pallet',           'Packaging', false, 'plt',   0)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Standard system conversions
  INSERT INTO public.uom_conversions
    (tenant_id, item_id, from_uom, to_uom, factor, uom_class) VALUES
    (new_tenant_id, NULL, 'g',     'kg',   0.001,        'Weight'),
    (new_tenant_id, NULL, 'lb',    'kg',   0.45359237,   'Weight'),
    (new_tenant_id, NULL, 'oz',    'kg',   0.02834952,   'Weight'),
    (new_tenant_id, NULL, 't',     'kg',   1000.0,       'Weight'),
    (new_tenant_id, NULL, 'kg',    'g',    1000.0,       'Weight'),
    (new_tenant_id, NULL, 'kg',    'lb',   2.20462262,   'Weight'),
    (new_tenant_id, NULL, 'cm',    'm',    0.01,         'Length'),
    (new_tenant_id, NULL, 'mm',    'm',    0.001,        'Length'),
    (new_tenant_id, NULL, 'in',    'm',    0.0254,       'Length'),
    (new_tenant_id, NULL, 'ft',    'm',    0.3048,       'Length'),
    (new_tenant_id, NULL, 'm',     'cm',   100.0,        'Length'),
    (new_tenant_id, NULL, 'm',     'mm',   1000.0,       'Length'),
    (new_tenant_id, NULL, 'ml',    'l',    0.001,        'Volume'),
    (new_tenant_id, NULL, 'gal',   'l',    3.78541178,   'Volume'),
    (new_tenant_id, NULL, 'l',     'ml',   1000.0,       'Volume'),
    (new_tenant_id, NULL, 'min',   'hr',   0.01666667,   'Time'),
    (new_tenant_id, NULL, 'day',   'hr',   24.0,         'Time'),
    (new_tenant_id, NULL, 'pcs',   'pc',   1.0,          'Unit'),
    (new_tenant_id, NULL, 'doz',   'pc',   12.0,         'Unit'),
    (new_tenant_id, NULL, 'pair',  'pc',   2.0,          'Unit')
  ON CONFLICT (tenant_id, item_id, from_uom, to_uom) DO NOTHING;

  RETURN NEW;
END;
$$;
