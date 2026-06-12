
-- Extend tax_rates for VAT management
ALTER TABLE public.tax_rates
  ADD COLUMN IF NOT EXISTS tax_type text NOT NULL DEFAULT 'both' CHECK (tax_type IN ('sales','purchase','both')),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- VAT rules table
CREATE TABLE IF NOT EXISTS public.vat_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('sales','purchases')),
  tax_rate_id uuid REFERENCES public.tax_rates(id) ON DELETE SET NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vat_rules TO authenticated;
GRANT ALL ON public.vat_rules TO service_role;

ALTER TABLE public.vat_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vat_rules_tenant" ON public.vat_rules
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER vat_rules_set_updated_at BEFORE UPDATE ON public.vat_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS vat_rules_tenant_idx ON public.vat_rules(tenant_id);
