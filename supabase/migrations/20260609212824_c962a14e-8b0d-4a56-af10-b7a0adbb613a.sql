-- Customer credits (credit notes / overpayments) holding available balances
CREATE TABLE public.customer_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_number TEXT,
  source TEXT NOT NULL DEFAULT 'credit_note' CHECK (source IN ('credit_note','overpayment','manual','refund')),
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
CREATE INDEX idx_customer_credits_tenant ON public.customer_credits(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_credits_customer ON public.customer_credits(customer_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_credits TO authenticated;
GRANT ALL ON public.customer_credits TO service_role;
ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_credits_tenant" ON public.customer_credits
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_customer_credits_updated BEFORE UPDATE ON public.customer_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Applications of a credit to an invoice
CREATE TABLE public.credit_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_id UUID NOT NULL REFERENCES public.customer_credits(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  applied_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_apps_tenant ON public.credit_applications(tenant_id);
CREATE INDEX idx_credit_apps_credit ON public.credit_applications(credit_id);
CREATE INDEX idx_credit_apps_invoice ON public.credit_applications(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_applications TO authenticated;
GRANT ALL ON public.credit_applications TO service_role;
ALTER TABLE public.credit_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_applications_tenant" ON public.credit_applications
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_credit_apps_updated BEFORE UPDATE ON public.credit_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply credit application: decrement credit balance and invoice balance
CREATE OR REPLACE FUNCTION public.apply_credit_balances()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_credit_balance NUMERIC(14,2); v_invoice_balance NUMERIC(14,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT balance INTO v_credit_balance FROM public.customer_credits WHERE id = NEW.credit_id FOR UPDATE;
    IF v_credit_balance IS NULL OR v_credit_balance < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient credit balance';
    END IF;
    UPDATE public.customer_credits
       SET balance = balance - NEW.amount,
           status = CASE WHEN balance - NEW.amount = 0 THEN 'applied' ELSE status END
     WHERE id = NEW.credit_id;

    SELECT balance_due INTO v_invoice_balance FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
    UPDATE public.invoices
       SET balance_due = GREATEST(0, COALESCE(balance_due,0) - NEW.amount),
           status = CASE
             WHEN GREATEST(0, COALESCE(balance_due,0) - NEW.amount) = 0 THEN 'paid'
             WHEN COALESCE(balance_due,0) - NEW.amount < COALESCE(balance_due,0) THEN 'partially_paid'
             ELSE status END
     WHERE id = NEW.invoice_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_apply_credit_balances
AFTER INSERT ON public.credit_applications
FOR EACH ROW EXECUTE FUNCTION public.apply_credit_balances();