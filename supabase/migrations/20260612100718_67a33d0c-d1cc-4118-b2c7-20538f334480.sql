
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE INDEX IF NOT EXISTS bank_transactions_source_idx
  ON public.bank_transactions(source_type, source_id);

CREATE OR REPLACE FUNCTION public.reconcile_bank_account_balance(_account UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_opening NUMERIC(14,2);
  v_net NUMERIC(14,2);
  v_new NUMERIC(14,2);
BEGIN
  SELECT tenant_id, COALESCE(opening_balance, 0)
    INTO v_tenant, v_opening
  FROM public.bank_accounts
  WHERE id = _account;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), v_tenant) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(SUM(COALESCE(deposit,0) - COALESCE(withdrawal,0)), 0)
    INTO v_net
  FROM public.bank_transactions
  WHERE bank_account_id = _account;

  v_new := v_opening + v_net;

  UPDATE public.bank_accounts
     SET current_balance = v_new, updated_at = now()
   WHERE id = _account;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_bank_account_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_account_balance(UUID) TO authenticated, service_role;
