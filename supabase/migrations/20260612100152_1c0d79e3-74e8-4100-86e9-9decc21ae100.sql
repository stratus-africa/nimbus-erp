
-- Auto-create bank_accounts rows for CoA accounts with Bank/Cash subtype
-- and keep them in sync.

CREATE OR REPLACE FUNCTION public.sync_coa_to_bank_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.bank_account_type;
  v_sub TEXT;
BEGIN
  v_sub := lower(coalesce(NEW.account_subtype, ''));
  IF v_sub = 'bank' THEN
    v_type := 'bank';
  ELSIF v_sub = 'cash' THEN
    v_type := 'cash';
  ELSIF v_sub = 'credit card' THEN
    v_type := 'credit_card';
  ELSIF v_sub = 'payment clearing account' THEN
    v_type := 'payment_clearing';
  ELSE
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE coa_account_id = NEW.id) THEN
      INSERT INTO public.bank_accounts (
        tenant_id, account_name, account_type, currency,
        opening_balance, current_balance, coa_account_id, is_active, description
      ) VALUES (
        NEW.tenant_id, NEW.name, v_type, 'KES',
        coalesce(NEW.opening_balance, 0), coalesce(NEW.opening_balance, 0),
        NEW.id, coalesce(NEW.is_active, true), NEW.description
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.bank_accounts
       SET account_name = NEW.name,
           account_type = v_type,
           is_active = coalesce(NEW.is_active, true),
           description = NEW.description,
           updated_at = now()
     WHERE coa_account_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_coa_to_bank_account_trg ON public.chart_of_accounts;
CREATE TRIGGER sync_coa_to_bank_account_trg
AFTER INSERT OR UPDATE ON public.chart_of_accounts
FOR EACH ROW EXECUTE FUNCTION public.sync_coa_to_bank_account();

-- Backfill: create bank_accounts rows for existing CoA bank/cash entries
INSERT INTO public.bank_accounts (tenant_id, account_name, account_type, currency, opening_balance, current_balance, coa_account_id, is_active, description)
SELECT c.tenant_id, c.name,
  CASE lower(c.account_subtype)
    WHEN 'bank' THEN 'bank'::public.bank_account_type
    WHEN 'cash' THEN 'cash'::public.bank_account_type
    WHEN 'credit card' THEN 'credit_card'::public.bank_account_type
    WHEN 'payment clearing account' THEN 'payment_clearing'::public.bank_account_type
  END,
  'KES', coalesce(c.opening_balance, 0), coalesce(c.opening_balance, 0),
  c.id, coalesce(c.is_active, true), c.description
FROM public.chart_of_accounts c
WHERE lower(c.account_subtype) IN ('bank','cash','credit card','payment clearing account')
  AND NOT EXISTS (SELECT 1 FROM public.bank_accounts ba WHERE ba.coa_account_id = c.id);
