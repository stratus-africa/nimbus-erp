
-- ============================================================
-- Cascade-delete handler for INVOICE PAYMENTS (Payments Received)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_invoice_payment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_paid NUMERIC(14,2);
  v_total    NUMERIC(14,2);
  v_bank_ids UUID[];
BEGIN
  -- 1. Roll back the invoice's amount_paid / balance_due / status.
  SELECT GREATEST(COALESCE(amount_paid,0) - COALESCE(OLD.amount,0), 0),
         COALESCE(total, 0)
    INTO v_new_paid, v_total
  FROM public.invoices
  WHERE id = OLD.invoice_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.invoices
       SET amount_paid = v_new_paid,
           balance_due = GREATEST(v_total - v_new_paid, 0),
           status = CASE
             WHEN status = 'cancelled' THEN status
             WHEN status = 'draft'     THEN status
             WHEN v_new_paid <= 0      THEN 'sent'::invoice_status
             WHEN v_new_paid < v_total THEN 'partially_paid'::invoice_status
             ELSE 'paid'::invoice_status
           END,
           updated_at = now()
     WHERE id = OLD.invoice_id;
  END IF;

  -- 2. Collect the bank accounts touched by this payment so we can
  --    reconcile them after deletion.
  SELECT COALESCE(array_agg(DISTINCT bank_account_id), '{}')
    INTO v_bank_ids
  FROM public.bank_transactions
  WHERE source_type = 'invoice_payments' AND source_id = OLD.id;

  -- 3. Remove the bank deposit row(s) this payment created.
  DELETE FROM public.bank_transactions
   WHERE source_type = 'invoice_payments' AND source_id = OLD.id;

  -- 4. Remove the matching journal entries (journal_lines cascade).
  DELETE FROM public.journal_entries
   WHERE source_type = 'invoice_payments' AND source_id = OLD.id;

  -- 5. Recompute bank account balances from scratch.
  IF v_bank_ids IS NOT NULL THEN
    UPDATE public.bank_accounts ba
       SET current_balance = COALESCE(ba.opening_balance, 0)
                           + COALESCE((
                               SELECT SUM(COALESCE(deposit,0) - COALESCE(withdrawal,0))
                               FROM public.bank_transactions
                               WHERE bank_account_id = ba.id
                             ), 0),
           updated_at = now()
     WHERE ba.id = ANY(v_bank_ids);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS invoice_payment_after_delete ON public.invoice_payments;
CREATE TRIGGER invoice_payment_after_delete
AFTER DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_payment_delete();


-- ============================================================
-- Cascade-delete handler for BILL PAYMENTS (Payments Made)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_bill_payment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_paid NUMERIC(14,2);
  v_total    NUMERIC(14,2);
  v_bank_ids UUID[];
BEGIN
  SELECT GREATEST(COALESCE(amount_paid,0) - COALESCE(OLD.amount,0), 0),
         COALESCE(total, 0)
    INTO v_new_paid, v_total
  FROM public.bills
  WHERE id = OLD.bill_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.bills
       SET amount_paid = v_new_paid,
           balance_due = GREATEST(v_total - v_new_paid, 0),
           status = CASE
             WHEN status = 'cancelled' THEN status
             WHEN status = 'draft'     THEN status
             WHEN v_new_paid <= 0      THEN 'open'::bill_status
             WHEN v_new_paid < v_total THEN 'partially_paid'::bill_status
             ELSE 'paid'::bill_status
           END,
           updated_at = now()
     WHERE id = OLD.bill_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT bank_account_id), '{}')
    INTO v_bank_ids
  FROM public.bank_transactions
  WHERE source_type = 'bill_payments' AND source_id = OLD.id;

  DELETE FROM public.bank_transactions
   WHERE source_type = 'bill_payments' AND source_id = OLD.id;

  DELETE FROM public.journal_entries
   WHERE source_type = 'bill_payments' AND source_id = OLD.id;

  IF v_bank_ids IS NOT NULL THEN
    UPDATE public.bank_accounts ba
       SET current_balance = COALESCE(ba.opening_balance, 0)
                           + COALESCE((
                               SELECT SUM(COALESCE(deposit,0) - COALESCE(withdrawal,0))
                               FROM public.bank_transactions
                               WHERE bank_account_id = ba.id
                             ), 0),
           updated_at = now()
     WHERE ba.id = ANY(v_bank_ids);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS bill_payment_after_delete ON public.bill_payments;
CREATE TRIGGER bill_payment_after_delete
AFTER DELETE ON public.bill_payments
FOR EACH ROW EXECUTE FUNCTION public.handle_bill_payment_delete();
