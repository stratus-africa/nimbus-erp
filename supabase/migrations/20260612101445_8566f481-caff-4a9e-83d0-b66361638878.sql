
-- =====================================================
-- Re-create payment delete triggers with audit logging
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_invoice_payment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_paid    NUMERIC(14,2);
  v_total       NUMERIC(14,2);
  v_new_status  invoice_status;
  v_invoice_no  TEXT;
  v_bank_ids    UUID[];
  v_removed_bt  JSONB;
  v_removed_je  JSONB;
  v_actor       UUID := auth.uid();
  v_actor_name  TEXT;
BEGIN
  -- Capture bank rows (with running deposit/withdrawal info) BEFORE delete
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', bt.id, 'bank_account_id', bt.bank_account_id,
           'deposit', bt.deposit, 'withdrawal', bt.withdrawal,
           'txn_date', bt.txn_date, 'reference', bt.reference
         )), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT bt.bank_account_id), '{}')
    INTO v_removed_bt, v_bank_ids
  FROM public.bank_transactions bt
  WHERE bt.source_type = 'invoice_payments' AND bt.source_id = OLD.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', je.id, 'entry_number', je.entry_number,
           'total_debit', je.total_debit, 'total_credit', je.total_credit
         )), '[]'::jsonb)
    INTO v_removed_je
  FROM public.journal_entries je
  WHERE je.source_type = 'invoice_payments' AND je.source_id = OLD.id;

  -- Roll back invoice
  SELECT GREATEST(COALESCE(amount_paid,0) - COALESCE(OLD.amount,0), 0),
         COALESCE(total, 0),
         invoice_number
    INTO v_new_paid, v_total, v_invoice_no
  FROM public.invoices
  WHERE id = OLD.invoice_id
  FOR UPDATE;

  IF FOUND THEN
    v_new_status := (
      SELECT CASE
        WHEN i.status IN ('cancelled','draft') THEN i.status
        WHEN v_new_paid <= 0                   THEN 'sent'::invoice_status
        WHEN v_new_paid < v_total              THEN 'partially_paid'::invoice_status
        ELSE 'paid'::invoice_status
      END
      FROM public.invoices i WHERE i.id = OLD.invoice_id
    );

    UPDATE public.invoices
       SET amount_paid = v_new_paid,
           balance_due = GREATEST(v_total - v_new_paid, 0),
           status      = v_new_status,
           updated_at  = now()
     WHERE id = OLD.invoice_id;
  END IF;

  -- Remove bank deposit + journal entries
  DELETE FROM public.bank_transactions
   WHERE source_type = 'invoice_payments' AND source_id = OLD.id;
  DELETE FROM public.journal_entries
   WHERE source_type = 'invoice_payments' AND source_id = OLD.id;

  -- Reconcile bank balances
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

  -- Audit log
  SELECT COALESCE(full_name, email, 'System')
    INTO v_actor_name
  FROM public.profiles WHERE user_id = v_actor;

  INSERT INTO public.audit_logs (
    tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details
  ) VALUES (
    OLD.tenant_id, v_actor, COALESCE(v_actor_name, 'System'),
    'invoice_payments', OLD.id, 'payment_deleted',
    format('%s deleted payment of %s on invoice %s; balance restored',
           COALESCE(v_actor_name,'System'), OLD.amount::text, COALESCE(v_invoice_no,'?')),
    jsonb_build_object(
      'payment_id',           OLD.id,
      'payment_amount',       OLD.amount,
      'payment_date',         OLD.payment_date,
      'invoice_id',           OLD.invoice_id,
      'invoice_number',       v_invoice_no,
      'invoice_new_paid',     v_new_paid,
      'invoice_new_balance',  GREATEST(v_total - v_new_paid, 0),
      'invoice_new_status',   v_new_status,
      'bank_transactions_removed', v_removed_bt,
      'journal_entries_removed',   v_removed_je,
      'bank_accounts_reconciled',  to_jsonb(v_bank_ids)
    )
  );

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_bill_payment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_paid    NUMERIC(14,2);
  v_total       NUMERIC(14,2);
  v_new_status  bill_status;
  v_bill_no     TEXT;
  v_bank_ids    UUID[];
  v_removed_bt  JSONB;
  v_removed_je  JSONB;
  v_actor       UUID := auth.uid();
  v_actor_name  TEXT;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', bt.id, 'bank_account_id', bt.bank_account_id,
           'deposit', bt.deposit, 'withdrawal', bt.withdrawal,
           'txn_date', bt.txn_date, 'reference', bt.reference
         )), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT bt.bank_account_id), '{}')
    INTO v_removed_bt, v_bank_ids
  FROM public.bank_transactions bt
  WHERE bt.source_type = 'bill_payments' AND bt.source_id = OLD.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', je.id, 'entry_number', je.entry_number,
           'total_debit', je.total_debit, 'total_credit', je.total_credit
         )), '[]'::jsonb)
    INTO v_removed_je
  FROM public.journal_entries je
  WHERE je.source_type = 'bill_payments' AND je.source_id = OLD.id;

  SELECT GREATEST(COALESCE(amount_paid,0) - COALESCE(OLD.amount,0), 0),
         COALESCE(total, 0),
         bill_number
    INTO v_new_paid, v_total, v_bill_no
  FROM public.bills
  WHERE id = OLD.bill_id
  FOR UPDATE;

  IF FOUND THEN
    v_new_status := (
      SELECT CASE
        WHEN b.status IN ('cancelled','draft') THEN b.status
        WHEN v_new_paid <= 0                   THEN 'open'::bill_status
        WHEN v_new_paid < v_total              THEN 'partially_paid'::bill_status
        ELSE 'paid'::bill_status
      END
      FROM public.bills b WHERE b.id = OLD.bill_id
    );

    UPDATE public.bills
       SET amount_paid = v_new_paid,
           balance_due = GREATEST(v_total - v_new_paid, 0),
           status      = v_new_status,
           updated_at  = now()
     WHERE id = OLD.bill_id;
  END IF;

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

  SELECT COALESCE(full_name, email, 'System')
    INTO v_actor_name
  FROM public.profiles WHERE user_id = v_actor;

  INSERT INTO public.audit_logs (
    tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details
  ) VALUES (
    OLD.tenant_id, v_actor, COALESCE(v_actor_name, 'System'),
    'bill_payments', OLD.id, 'payment_deleted',
    format('%s deleted payment of %s on bill %s; balance restored',
           COALESCE(v_actor_name,'System'), OLD.amount::text, COALESCE(v_bill_no,'?')),
    jsonb_build_object(
      'payment_id',           OLD.id,
      'payment_amount',       OLD.amount,
      'payment_date',         OLD.payment_date,
      'bill_id',              OLD.bill_id,
      'bill_number',          v_bill_no,
      'bill_new_paid',        v_new_paid,
      'bill_new_balance',     GREATEST(v_total - v_new_paid, 0),
      'bill_new_status',      v_new_status,
      'bank_transactions_removed', v_removed_bt,
      'journal_entries_removed',   v_removed_je,
      'bank_accounts_reconciled',  to_jsonb(v_bank_ids)
    )
  );

  RETURN OLD;
END;
$$;
