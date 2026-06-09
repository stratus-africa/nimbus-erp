
-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin','company_admin','accountant','sales','purchasing','inventory','readonly');
CREATE TYPE public.tenant_status AS ENUM ('trial','active','suspended');
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','income','expense');
CREATE TYPE public.item_type AS ENUM ('inventory','service','non_inventory');
CREATE TYPE public.adjustment_type AS ENUM ('increase','decrease','recount');
CREATE TYPE public.quote_status AS ENUM ('draft','sent','accepted','rejected','converted');
CREATE TYPE public.invoice_status AS ENUM ('draft','sent','partially_paid','paid','overdue','cancelled');
CREATE TYPE public.po_status AS ENUM ('draft','approved','sent','partially_received','received','closed','cancelled');
CREATE TYPE public.bill_status AS ENUM ('draft','open','partially_paid','paid','overdue','cancelled');

-- ============ HELPER: updated_at ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ SUBSCRIPTION PLANS ============
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_users INT NOT NULL DEFAULT 5,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated, anon;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read_all" ON public.subscription_plans FOR SELECT USING (true);
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.subscription_plans (name, description, price_monthly, max_users, features) VALUES
  ('Starter', 'For small teams getting started', 0, 3, '{"reports":"basic"}'),
  ('Professional', 'Growing businesses', 29, 10, '{"reports":"advanced","approval_workflows":true}'),
  ('Enterprise', 'Larger organizations', 99, 50, '{"reports":"advanced","approval_workflows":true,"api":true}');

-- ============ TENANTS ============
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status public.tenant_status NOT NULL DEFAULT 'trial',
  plan_id UUID REFERENCES public.subscription_plans(id),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  fiscal_year_start INT NOT NULL DEFAULT 1, -- month 1-12
  logo_url TEXT,
  address TEXT,
  tax_number TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  current_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TENANT MEMBERS ============
CREATE TABLE public.tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_super_admin(_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user UUID, _tenant UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user AND role = _role
      AND (tenant_id = _tenant OR role = 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user UUID, _tenant UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.tenant_members WHERE user_id=_user AND tenant_id=_tenant)
      OR public.is_super_admin(_user);
$$;

CREATE OR REPLACE FUNCTION public.current_tenant()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT current_tenant_id FROM public.profiles WHERE user_id = auth.uid();
$$;

-- Tenants RLS
CREATE POLICY "tenants_select_members" ON public.tenants FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), id));
CREATE POLICY "tenants_update_admin" ON public.tenants FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), id, 'company_admin') OR public.is_super_admin(auth.uid()));
CREATE POLICY "tenants_insert_any" ON public.tenants FOR INSERT TO authenticated WITH CHECK (true);

-- tenant_members RLS
CREATE POLICY "tm_select" ON public.tenant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tm_insert_admin" ON public.tenant_members FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'company_admin') OR user_id = auth.uid());
CREATE POLICY "tm_delete_admin" ON public.tenant_members FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'company_admin'));

-- user_roles RLS
CREATE POLICY "ur_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), tenant_id, 'company_admin') OR public.is_super_admin(auth.uid()));

-- ============ AUTH TRIGGER: auto-create profile ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ COMPANY SETTINGS / TAX RATES / NUMBERING ============
CREATE TABLE public.tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_rates TO authenticated;
GRANT ALL ON public.tax_rates TO service_role;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_rates_tenant" ON public.tax_rates FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE public.numbering_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  next_number INT NOT NULL DEFAULT 1,
  padding INT NOT NULL DEFAULT 4,
  UNIQUE (tenant_id, doc_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.numbering_series TO authenticated;
GRANT ALL ON public.numbering_series TO service_role;
ALTER TABLE public.numbering_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "num_series_tenant" ON public.numbering_series FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ============ CHART OF ACCOUNTS ============
CREATE TABLE public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type public.account_type NOT NULL,
  parent_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_coa_tenant ON public.chart_of_accounts(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coa_tenant" ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  company_name TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  pin_number TEXT,
  vat_number TEXT,
  credit_limit NUMERIC(14,2) DEFAULT 0,
  payment_terms_days INT DEFAULT 30,
  billing_address TEXT,
  shipping_address TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_customers_tenant ON public.customers(tenant_id) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_tenant" ON public.customers FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SUPPLIERS ============
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  pin_number TEXT,
  payment_terms_days INT DEFAULT 30,
  address TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_suppliers_tenant ON public.suppliers(tenant_id) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_tenant" ON public.suppliers FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ITEMS ============
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku TEXT,
  barcode TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  item_type public.item_type NOT NULL DEFAULT 'inventory',
  unit TEXT DEFAULT 'unit',
  cost_price NUMERIC(14,2) DEFAULT 0,
  selling_price NUMERIC(14,2) DEFAULT 0,
  reorder_level NUMERIC(14,2) DEFAULT 0,
  stock_on_hand NUMERIC(14,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_items_tenant ON public.items(tenant_id) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_tenant" ON public.items FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ INVENTORY ADJUSTMENTS ============
CREATE TABLE public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  adjustment_number TEXT,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  adjustment_type public.adjustment_type NOT NULL,
  reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_adj_tenant" ON public.inventory_adjustments FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE public.inventory_adjustment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES public.inventory_adjustments(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  qty_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  qty_after NUMERIC(14,2) NOT NULL DEFAULT 0,
  variance NUMERIC(14,2) GENERATED ALWAYS AS (qty_after - qty_before) STORED
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_adjustment_lines TO authenticated;
GRANT ALL ON public.inventory_adjustment_lines TO service_role;
ALTER TABLE public.inventory_adjustment_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_adj_lines_tenant" ON public.inventory_adjustment_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_adjustments a WHERE a.id = adjustment_id AND public.is_tenant_member(auth.uid(), a.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventory_adjustments a WHERE a.id = adjustment_id AND public.is_tenant_member(auth.uid(), a.tenant_id)));

-- ============ QUOTES ============
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  status public.quote_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, quote_number)
);
CREATE INDEX idx_quotes_tenant ON public.quotes(tenant_id) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_tenant" ON public.quotes FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  description TEXT,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_lines TO authenticated;
GRANT ALL ON public.quote_lines TO service_role;
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ql_tenant" ON public.quote_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id=quote_id AND public.is_tenant_member(auth.uid(), q.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id=quote_id AND public.is_tenant_member(auth.uid(), q.tenant_id)));

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  source_quote_id UUID REFERENCES public.quotes(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX idx_invoices_tenant ON public.invoices(tenant_id) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_tenant" ON public.invoices FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  description TEXT,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "il_tenant" ON public.invoice_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND public.is_tenant_member(auth.uid(), i.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND public.is_tenant_member(auth.uid(), i.tenant_id)));

CREATE TABLE public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  method TEXT,
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip_tenant" ON public.invoice_payments FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ============ PURCHASE ORDERS ============
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  status public.po_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, po_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_tenant" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  description TEXT,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;
GRANT ALL ON public.purchase_order_lines TO service_role;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pol_tenant" ON public.purchase_order_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id=po_id AND public.is_tenant_member(auth.uid(), p.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id=po_id AND public.is_tenant_member(auth.uid(), p.tenant_id)));

-- ============ BILLS ============
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status public.bill_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  source_po_id UUID REFERENCES public.purchase_orders(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, bill_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bills_tenant" ON public.bills FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_bills_updated BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bill_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  account_id UUID REFERENCES public.chart_of_accounts(id),
  description TEXT,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_lines TO authenticated;
GRANT ALL ON public.bill_lines TO service_role;
ALTER TABLE public.bill_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bl_tenant" ON public.bill_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id=bill_id AND public.is_tenant_member(auth.uid(), b.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id=bill_id AND public.is_tenant_member(auth.uid(), b.tenant_id)));

CREATE TABLE public.bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  method TEXT,
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_payments TO authenticated;
GRANT ALL ON public.bill_payments TO service_role;
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_tenant" ON public.bill_payments FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- ============ JOURNAL ENTRIES ============
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  description TEXT,
  total_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_type TEXT, -- invoice|bill|payment|manual
  source_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entry_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "je_tenant" ON public.journal_entries FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  description TEXT,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jl_tenant" ON public.journal_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.id=entry_id AND public.is_tenant_member(auth.uid(), j.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.id=entry_id AND public.is_tenant_member(auth.uid(), j.tenant_id)));

-- ============ TENANT PROVISIONING RPC ============
CREATE OR REPLACE FUNCTION public.provision_tenant(_name TEXT, _slug TEXT, _currency TEXT DEFAULT 'USD')
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant_id UUID;
  v_user UUID := auth.uid();
  v_plan UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_plan FROM public.subscription_plans WHERE name='Starter' LIMIT 1;

  INSERT INTO public.tenants (name, slug, status, plan_id, base_currency)
  VALUES (_name, _slug, 'trial', v_plan, _currency)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id) VALUES (v_tenant_id, v_user);
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (v_user, v_tenant_id, 'company_admin');

  UPDATE public.profiles SET current_tenant_id = v_tenant_id WHERE user_id = v_user;

  -- Seed Chart of Accounts
  INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type) VALUES
    (v_tenant_id, '1000', 'Cash', 'asset'),
    (v_tenant_id, '1010', 'Bank Account', 'asset'),
    (v_tenant_id, '1200', 'Accounts Receivable', 'asset'),
    (v_tenant_id, '1300', 'Inventory', 'asset'),
    (v_tenant_id, '1500', 'Fixed Assets', 'asset'),
    (v_tenant_id, '2000', 'Accounts Payable', 'liability'),
    (v_tenant_id, '2100', 'Sales Tax Payable', 'liability'),
    (v_tenant_id, '2500', 'Long Term Debt', 'liability'),
    (v_tenant_id, '3000', 'Owner Equity', 'equity'),
    (v_tenant_id, '3100', 'Retained Earnings', 'equity'),
    (v_tenant_id, '4000', 'Sales Revenue', 'income'),
    (v_tenant_id, '4100', 'Service Revenue', 'income'),
    (v_tenant_id, '5000', 'Cost of Goods Sold', 'expense'),
    (v_tenant_id, '6000', 'Salaries & Wages', 'expense'),
    (v_tenant_id, '6100', 'Rent Expense', 'expense'),
    (v_tenant_id, '6200', 'Utilities', 'expense'),
    (v_tenant_id, '6300', 'Office Supplies', 'expense'),
    (v_tenant_id, '6400', 'Marketing', 'expense');

  -- Seed numbering series
  INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number) VALUES
    (v_tenant_id, 'quote', 'QT-', 1),
    (v_tenant_id, 'invoice', 'INV-', 1),
    (v_tenant_id, 'purchase_order', 'PO-', 1),
    (v_tenant_id, 'bill', 'BL-', 1),
    (v_tenant_id, 'journal', 'JE-', 1),
    (v_tenant_id, 'adjustment', 'ADJ-', 1);

  -- Default tax rate
  INSERT INTO public.tax_rates (tenant_id, name, rate, is_default) VALUES
    (v_tenant_id, 'Standard', 16, true),
    (v_tenant_id, 'Zero', 0, false);

  RETURN v_tenant_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.provision_tenant(TEXT, TEXT, TEXT) TO authenticated;

-- ============ NEXT DOC NUMBER RPC ============
CREATE OR REPLACE FUNCTION public.next_doc_number(_tenant UUID, _doc_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_prefix TEXT;
  v_num INT;
  v_padding INT;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant) THEN
    RAISE EXCEPTION 'Not a tenant member';
  END IF;
  UPDATE public.numbering_series SET next_number = next_number + 1
    WHERE tenant_id = _tenant AND doc_type = _doc_type
    RETURNING prefix, next_number - 1, padding INTO v_prefix, v_num, v_padding;
  IF v_num IS NULL THEN
    INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number)
    VALUES (_tenant, _doc_type, upper(_doc_type) || '-', 2)
    RETURNING prefix, 1, padding INTO v_prefix, v_num, v_padding;
  END IF;
  RETURN v_prefix || lpad(v_num::text, v_padding, '0');
END; $$;
GRANT EXECUTE ON FUNCTION public.next_doc_number(UUID, TEXT) TO authenticated;

-- ============ SWITCH TENANT RPC ============
CREATE OR REPLACE FUNCTION public.switch_tenant(_tenant UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant) THEN
    RAISE EXCEPTION 'Not a tenant member';
  END IF;
  UPDATE public.profiles SET current_tenant_id = _tenant WHERE user_id = auth.uid();
END; $$;
GRANT EXECUTE ON FUNCTION public.switch_tenant(UUID) TO authenticated;
