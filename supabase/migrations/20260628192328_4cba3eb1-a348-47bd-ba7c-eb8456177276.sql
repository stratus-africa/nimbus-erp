
-- Expense status enum
DO $$ BEGIN
  CREATE TYPE public.expense_status AS ENUM ('draft','submitted','approved','rejected','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Categories
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  expense_account_id UUID REFERENCES public.chart_of_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_tenant ON public.expense_categories FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER expense_categories_updated BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  expense_number TEXT NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  submitted_by_user_id UUID REFERENCES auth.users(id),
  employee_user_id UUID REFERENCES auth.users(id),
  vendor_id UUID REFERENCES public.suppliers(id),
  customer_id UUID REFERENCES public.customers(id),
  category_id UUID REFERENCES public.expense_categories(id),
  expense_account_id UUID REFERENCES public.chart_of_accounts(id),
  payment_account_id UUID REFERENCES public.chart_of_accounts(id),
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(14,6) NOT NULL DEFAULT 1,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.expense_status NOT NULL DEFAULT 'draft',
  is_billable BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  reference TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, expense_number)
);
CREATE INDEX expenses_tenant_status_idx ON public.expenses(tenant_id, status);
CREATE INDEX expenses_tenant_date_idx ON public.expenses(tenant_id, expense_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY exp_tenant ON public.expenses FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER expenses_updated BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Itemized lines
CREATE TABLE public.expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id),
  account_id UUID REFERENCES public.chart_of_accounts(id),
  description TEXT,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 1,
  rate NUMERIC(14,4) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  customer_id UUID REFERENCES public.customers(id),
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_items TO authenticated;
GRANT ALL ON public.expense_items TO service_role;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY ei_tenant ON public.expense_items FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.expenses e WHERE e.id = expense_items.expense_id AND public.is_tenant_member(auth.uid(), e.tenant_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.expenses e WHERE e.id = expense_items.expense_id AND public.is_tenant_member(auth.uid(), e.tenant_id)));

-- Receipts
CREATE TABLE public.expense_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_receipts TO authenticated;
GRANT ALL ON public.expense_receipts TO service_role;
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY er_tenant ON public.expense_receipts FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.expenses e WHERE e.id = expense_receipts.expense_id AND public.is_tenant_member(auth.uid(), e.tenant_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.expenses e WHERE e.id = expense_receipts.expense_id AND public.is_tenant_member(auth.uid(), e.tenant_id)));

-- Approvals (single-level workflow now; multi-level capable)
CREATE TABLE public.expense_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES auth.users(id),
  approval_level INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  comments TEXT,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_approvals TO authenticated;
GRANT ALL ON public.expense_approvals TO service_role;
ALTER TABLE public.expense_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ea_tenant ON public.expense_approvals FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.expenses e WHERE e.id = expense_approvals.expense_id AND public.is_tenant_member(auth.uid(), e.tenant_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.expenses e WHERE e.id = expense_approvals.expense_id AND public.is_tenant_member(auth.uid(), e.tenant_id)));

-- Numbering series for new + existing tenants
INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number)
SELECT id, 'expense', 'EXP-', 1 FROM public.tenants
ON CONFLICT DO NOTHING;

-- Approve & post journal: debit expense accts, credit payment acct
CREATE OR REPLACE FUNCTION public.approve_expense(_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_exp RECORD;
  v_entry_id UUID;
  v_entry_number TEXT;
  v_pos INT := 0;
  v_item RECORD;
  v_acct UUID;
  v_total NUMERIC(14,2) := 0;
BEGIN
  SELECT * INTO v_exp FROM public.expenses WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_exp.tenant_id) THEN RAISE EXCEPTION 'Not a tenant member'; END IF;
  IF v_exp.status NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'Cannot approve from status %', v_exp.status; END IF;
  IF v_exp.payment_account_id IS NULL THEN RAISE EXCEPTION 'Payment account is required to approve'; END IF;

  v_entry_number := public.next_doc_number(v_exp.tenant_id, 'journal');
  INSERT INTO public.journal_entries(tenant_id, entry_number, entry_date, reference, description, source_type, source_id, created_by)
  VALUES (v_exp.tenant_id, v_entry_number, v_exp.expense_date, v_exp.expense_number,
          COALESCE(v_exp.notes, 'Expense ' || v_exp.expense_number), 'expenses', v_exp.id, auth.uid())
  RETURNING id INTO v_entry_id;

  -- Debit lines
  FOR v_item IN SELECT * FROM public.expense_items WHERE expense_id = v_exp.id ORDER BY position LOOP
    v_acct := COALESCE(v_item.account_id,
                       (SELECT expense_account_id FROM public.expense_categories WHERE id = v_item.category_id),
                       v_exp.expense_account_id);
    IF v_acct IS NULL THEN RAISE EXCEPTION 'No expense account on line %', v_item.position+1; END IF;
    INSERT INTO public.journal_lines(entry_id, account_id, description, debit, credit, position)
    VALUES (v_entry_id, v_acct, v_item.description, COALESCE(v_item.amount,0) + COALESCE(v_item.tax_amount,0), 0, v_pos);
    v_total := v_total + COALESCE(v_item.amount,0) + COALESCE(v_item.tax_amount,0);
    v_pos := v_pos + 1;
  END LOOP;

  -- Fallback if no line items: use expense totals
  IF v_pos = 0 THEN
    IF v_exp.expense_account_id IS NULL THEN RAISE EXCEPTION 'Expense account required'; END IF;
    INSERT INTO public.journal_lines(entry_id, account_id, description, debit, credit, position)
    VALUES (v_entry_id, v_exp.expense_account_id, v_exp.notes, v_exp.total_amount, 0, 0);
    v_total := v_exp.total_amount;
    v_pos := 1;
  END IF;

  -- Credit payment account
  INSERT INTO public.journal_lines(entry_id, account_id, description, debit, credit, position)
  VALUES (v_entry_id, v_exp.payment_account_id, 'Payment for ' || v_exp.expense_number, 0, v_total, v_pos);

  UPDATE public.journal_entries SET total_debit = v_total, total_credit = v_total WHERE id = v_entry_id;

  UPDATE public.expenses
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(), journal_entry_id = v_entry_id
    WHERE id = _id;

  INSERT INTO public.expense_approvals(expense_id, approver_id, status, acted_at)
  VALUES (_id, auth.uid(), 'approved', now());

  RETURN v_entry_id;
END $$;

CREATE OR REPLACE FUNCTION public.reject_expense(_id UUID, _comment TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exp RECORD;
BEGIN
  SELECT * INTO v_exp FROM public.expenses WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_exp.tenant_id) THEN RAISE EXCEPTION 'Not a tenant member'; END IF;
  UPDATE public.expenses SET status='rejected' WHERE id = _id;
  INSERT INTO public.expense_approvals(expense_id, approver_id, status, comments, acted_at)
  VALUES (_id, auth.uid(), 'rejected', _comment, now());
END $$;

CREATE OR REPLACE FUNCTION public.mark_expense_paid(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exp RECORD;
BEGIN
  SELECT * INTO v_exp FROM public.expenses WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_exp.tenant_id) THEN RAISE EXCEPTION 'Not a tenant member'; END IF;
  IF v_exp.status <> 'approved' THEN RAISE EXCEPTION 'Only approved expenses can be marked paid'; END IF;
  UPDATE public.expenses SET status='paid', paid_at=now() WHERE id = _id;
END $$;
