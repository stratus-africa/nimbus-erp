
DO $$ BEGIN
  CREATE TYPE public.sales_order_status AS ENUM ('draft','confirmed','sent','partially_invoiced','invoiced','closed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  so_number text NOT NULL,
  customer_id uuid REFERENCES public.customers(id),
  so_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_shipment_date date,
  status public.sales_order_status NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  source_quote_id uuid REFERENCES public.quotes(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, so_number)
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant ON public.sales_orders(tenant_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO authenticated;
GRANT ALL ON public.sales_orders TO service_role;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_orders_tenant ON public.sales_orders;
CREATE POLICY sales_orders_tenant ON public.sales_orders TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

DROP TRIGGER IF EXISTS trg_sales_orders_updated ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_updated BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id),
  description text,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  rate numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_lines TO authenticated;
GRANT ALL ON public.sales_order_lines TO service_role;
ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sol_tenant ON public.sales_order_lines;
CREATE POLICY sol_tenant ON public.sales_order_lines TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_orders s WHERE s.id = sales_order_lines.sales_order_id AND public.is_tenant_member(auth.uid(), s.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_orders s WHERE s.id = sales_order_lines.sales_order_id AND public.is_tenant_member(auth.uid(), s.tenant_id)));

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source_sales_order_id uuid REFERENCES public.sales_orders(id);

INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number, padding)
SELECT id, 'sales_order', 'SO-', 1, 4 FROM public.tenants
ON CONFLICT DO NOTHING;
