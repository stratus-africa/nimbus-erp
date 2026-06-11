
-- Audit logs (generic, tenant-scoped)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_name TEXT,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  summary TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id, created_at DESC);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

-- Supplier credits (mirror of customer_credits, for vendor prepayments / overpayments)
CREATE TABLE public.supplier_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  credit_number TEXT,
  source TEXT NOT NULL DEFAULT 'overpayment'
    CHECK (source IN ('debit_note','overpayment','manual','refund','prepayment')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  balance NUMERIC(14,2) NOT NULL CHECK (balance >= 0),
  reference TEXT,
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','void')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_supplier_credits_tenant ON public.supplier_credits(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_supplier_credits_supplier ON public.supplier_credits(supplier_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_credits TO authenticated;
GRANT ALL ON public.supplier_credits TO service_role;

ALTER TABLE public.supplier_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_credits_tenant" ON public.supplier_credits FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER trg_supplier_credits_updated BEFORE UPDATE ON public.supplier_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed advance/prepayment accounts for existing tenants (idempotent)
INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type)
SELECT t.id, '2150', 'Customer Advances', 'liability' FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type)
SELECT t.id, '1450', 'Supplier Advances', 'asset' FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type)
SELECT t.id, '1020', 'MPESA', 'asset' FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type)
SELECT t.id, '1030', 'Petty Cash', 'asset' FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;
