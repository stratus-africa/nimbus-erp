
CREATE TYPE public.bank_account_type AS ENUM ('cash', 'bank', 'credit_card', 'payment_clearing');

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_name text NOT NULL,
  account_type public.bank_account_type NOT NULL DEFAULT 'bank',
  bank_name text,
  account_number text,
  routing_number text,
  iban text,
  swift_code text,
  currency text NOT NULL DEFAULT 'KES',
  opening_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  description text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can view bank accounts" ON public.bank_accounts FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant members can insert bank accounts" ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant members can update bank accounts" ON public.bank_accounts FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant members can delete bank accounts" ON public.bank_accounts FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE TRIGGER set_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_bank_accounts_tenant ON public.bank_accounts(tenant_id);
