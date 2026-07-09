
-- =============================================================
-- 1. PACKAGE STATUS ACTIONS + AUDIT
-- =============================================================
CREATE OR REPLACE FUNCTION public.set_package_status(_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_prev text;
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF _status NOT IN ('not_shipped','packed','shipped','delivered') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;

  SELECT tenant_id, status INTO v_tenant, v_prev FROM public.packages WHERE id = _id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Package not found'; END IF;
  IF NOT is_tenant_member(v_actor, v_tenant) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.packages SET status = _status, updated_at = now() WHERE id = _id;

  -- Cascade to linked shipment if one exists
  UPDATE public.shipments s
  SET status = CASE _status
                 WHEN 'shipped' THEN 'in_transit'
                 WHEN 'delivered' THEN 'delivered'
                 WHEN 'not_shipped' THEN 'pending'
                 ELSE s.status END,
      updated_at = now()
  WHERE s.id IN (SELECT shipment_id FROM public.shipment_packages WHERE package_id = _id);

  SELECT COALESCE(full_name, email) INTO v_actor_name FROM public.profiles WHERE user_id = v_actor;

  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_tenant, v_actor, v_actor_name, 'package', _id, 'status_change',
          format('Package status changed from %s to %s', v_prev, _status),
          jsonb_build_object('from', v_prev, 'to', _status));
END $$;

GRANT EXECUTE ON FUNCTION public.set_package_status(uuid, text) TO authenticated;

-- =============================================================
-- 2. TRANSACTION TOTALS RECALCULATION
-- =============================================================
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub numeric := 0; v_tax numeric := 0; v_paid numeric := 0;
BEGIN
  SELECT COALESCE(SUM(quantity * rate),0),
         COALESCE(SUM(quantity * rate * tax_rate / 100.0),0)
    INTO v_sub, v_tax FROM public.invoice_lines WHERE invoice_id = _id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.invoice_payments WHERE invoice_id = _id;
  UPDATE public.invoices
     SET subtotal = v_sub, tax_total = v_tax, total = v_sub + v_tax,
         amount_paid = v_paid, balance_due = (v_sub + v_tax) - v_paid,
         updated_at = now()
   WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.recalc_bill_totals(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub numeric := 0; v_tax numeric := 0; v_paid numeric := 0;
BEGIN
  SELECT COALESCE(SUM(quantity * rate),0),
         COALESCE(SUM(quantity * rate * tax_rate / 100.0),0)
    INTO v_sub, v_tax FROM public.bill_lines WHERE bill_id = _id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.bill_payments WHERE bill_id = _id;
  UPDATE public.bills
     SET subtotal = v_sub, tax_total = v_tax, total = v_sub + v_tax,
         amount_paid = v_paid, balance_due = (v_sub + v_tax) - v_paid,
         updated_at = now()
   WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.recalc_quote_totals(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub numeric := 0; v_tax numeric := 0;
BEGIN
  SELECT COALESCE(SUM(quantity * rate),0),
         COALESCE(SUM(quantity * rate * tax_rate / 100.0),0)
    INTO v_sub, v_tax FROM public.quote_lines WHERE quote_id = _id;
  UPDATE public.quotes SET subtotal = v_sub, tax_total = v_tax, total = v_sub + v_tax, updated_at = now() WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.recalc_so_totals(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub numeric := 0; v_tax numeric := 0;
BEGIN
  SELECT COALESCE(SUM(quantity * rate),0),
         COALESCE(SUM(quantity * rate * tax_rate / 100.0),0)
    INTO v_sub, v_tax FROM public.sales_order_lines WHERE sales_order_id = _id;
  UPDATE public.sales_orders SET subtotal = v_sub, tax_total = v_tax, total = v_sub + v_tax, updated_at = now() WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.recalc_po_totals(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub numeric := 0; v_tax numeric := 0;
BEGIN
  SELECT COALESCE(SUM(quantity * rate),0),
         COALESCE(SUM(quantity * rate * tax_rate / 100.0),0)
    INTO v_sub, v_tax FROM public.purchase_order_lines WHERE purchase_order_id = _id;
  UPDATE public.purchase_orders SET subtotal = v_sub, tax_total = v_tax, total = v_sub + v_tax, updated_at = now() WHERE id = _id;
END $$;

GRANT EXECUTE ON FUNCTION public.recalc_invoice_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_bill_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_quote_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_so_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_po_totals(uuid) TO authenticated;

-- =============================================================
-- 3. TRIGGERS TO KEEP TOTALS + AUDIT LOG IN SYNC
-- =============================================================
CREATE OR REPLACE FUNCTION public._trg_line_recalc_and_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent uuid;
  v_tenant uuid;
  v_entity_type text := TG_ARGV[0];  -- 'invoice','bill','quote','sales_order','purchase_order'
  v_parent_col text := TG_ARGV[1];   -- column on line row that points to parent id
  v_line jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_summary text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    EXECUTE format('SELECT ($1).%I', v_parent_col) USING OLD INTO v_parent;
    v_line := to_jsonb(OLD);
  ELSE
    EXECUTE format('SELECT ($1).%I', v_parent_col) USING NEW INTO v_parent;
    v_line := to_jsonb(NEW);
  END IF;

  -- Recompute parent totals
  CASE v_entity_type
    WHEN 'invoice'        THEN PERFORM public.recalc_invoice_totals(v_parent);
    WHEN 'bill'           THEN PERFORM public.recalc_bill_totals(v_parent);
    WHEN 'quote'          THEN PERFORM public.recalc_quote_totals(v_parent);
    WHEN 'sales_order'    THEN PERFORM public.recalc_so_totals(v_parent);
    WHEN 'purchase_order' THEN PERFORM public.recalc_po_totals(v_parent);
  END CASE;

  -- Get tenant + build audit
  EXECUTE format('SELECT tenant_id FROM public.%I WHERE id = $1',
                 CASE v_entity_type
                   WHEN 'invoice' THEN 'invoices'
                   WHEN 'bill' THEN 'bills'
                   WHEN 'quote' THEN 'quotes'
                   WHEN 'sales_order' THEN 'sales_orders'
                   WHEN 'purchase_order' THEN 'purchase_orders'
                 END) USING v_parent INTO v_tenant;

  IF v_tenant IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(full_name, email) INTO v_actor_name FROM public.profiles WHERE user_id = v_actor;

  IF TG_OP = 'INSERT' THEN
    v_summary := format('Line added: %s (qty %s × %s)',
                        COALESCE(NEW.description, 'item'), NEW.quantity, NEW.rate);
  ELSIF TG_OP = 'DELETE' THEN
    v_summary := format('Line removed: %s (qty %s × %s)',
                        COALESCE(OLD.description, 'item'), OLD.quantity, OLD.rate);
  ELSE
    -- Diff each column
    IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
      v_changes := v_changes || jsonb_build_object('quantity', jsonb_build_object('from', OLD.quantity, 'to', NEW.quantity));
    END IF;
    IF OLD.rate IS DISTINCT FROM NEW.rate THEN
      v_changes := v_changes || jsonb_build_object('rate', jsonb_build_object('from', OLD.rate, 'to', NEW.rate));
    END IF;
    IF OLD.tax_rate IS DISTINCT FROM NEW.tax_rate THEN
      v_changes := v_changes || jsonb_build_object('tax_rate', jsonb_build_object('from', OLD.tax_rate, 'to', NEW.tax_rate));
    END IF;
    IF OLD.description IS DISTINCT FROM NEW.description THEN
      v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('from', OLD.description, 'to', NEW.description));
    END IF;
    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    v_summary := format('Line edited: %s', COALESCE(NEW.description, 'item'));
  END IF;

  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_tenant, v_actor, v_actor_name, v_entity_type, v_parent,
          'line_' || lower(TG_OP), v_summary,
          jsonb_build_object('line', v_line, 'changes', v_changes));

  RETURN COALESCE(NEW, OLD);
END $$;

-- Attach triggers (drop-then-create for idempotency)
DROP TRIGGER IF EXISTS trg_invoice_lines_audit ON public.invoice_lines;
CREATE TRIGGER trg_invoice_lines_audit
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines
FOR EACH ROW EXECUTE FUNCTION public._trg_line_recalc_and_audit('invoice', 'invoice_id');

DROP TRIGGER IF EXISTS trg_bill_lines_audit ON public.bill_lines;
CREATE TRIGGER trg_bill_lines_audit
AFTER INSERT OR UPDATE OR DELETE ON public.bill_lines
FOR EACH ROW EXECUTE FUNCTION public._trg_line_recalc_and_audit('bill', 'bill_id');

DROP TRIGGER IF EXISTS trg_quote_lines_audit ON public.quote_lines;
CREATE TRIGGER trg_quote_lines_audit
AFTER INSERT OR UPDATE OR DELETE ON public.quote_lines
FOR EACH ROW EXECUTE FUNCTION public._trg_line_recalc_and_audit('quote', 'quote_id');

DROP TRIGGER IF EXISTS trg_so_lines_audit ON public.sales_order_lines;
CREATE TRIGGER trg_so_lines_audit
AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_lines
FOR EACH ROW EXECUTE FUNCTION public._trg_line_recalc_and_audit('sales_order', 'sales_order_id');

DROP TRIGGER IF EXISTS trg_po_lines_audit ON public.purchase_order_lines;
CREATE TRIGGER trg_po_lines_audit
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION public._trg_line_recalc_and_audit('purchase_order', 'purchase_order_id');

-- =============================================================
-- 4. HEADER EDIT AUDIT (invoices, bills, quotes, sales_orders, purchase_orders)
-- =============================================================
CREATE OR REPLACE FUNCTION public._trg_transaction_header_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entity_type text := TG_ARGV[0];
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
  k text;
BEGIN
  -- Track only human-relevant fields (skip updated_at / totals recomputed by triggers)
  FOR k IN SELECT jsonb_object_keys(v_new) LOOP
    IF k IN ('updated_at','created_at','subtotal','tax_total','total','amount_paid','balance_due') THEN
      CONTINUE;
    END IF;
    IF v_old->k IS DISTINCT FROM v_new->k THEN
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old->k, 'to', v_new->k));
    END IF;
  END LOOP;

  IF v_changes = '{}'::jsonb THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, email) INTO v_actor_name FROM public.profiles WHERE user_id = v_actor;

  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (NEW.tenant_id, v_actor, v_actor_name, v_entity_type, NEW.id, 'header_update',
          format('%s header edited (%s field%s)', v_entity_type,
                 (SELECT count(*) FROM jsonb_object_keys(v_changes)),
                 CASE WHEN (SELECT count(*) FROM jsonb_object_keys(v_changes)) = 1 THEN '' ELSE 's' END),
          jsonb_build_object('changes', v_changes));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_header_audit ON public.invoices;
CREATE TRIGGER trg_invoice_header_audit AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public._trg_transaction_header_audit('invoice');

DROP TRIGGER IF EXISTS trg_bill_header_audit ON public.bills;
CREATE TRIGGER trg_bill_header_audit AFTER UPDATE ON public.bills
FOR EACH ROW EXECUTE FUNCTION public._trg_transaction_header_audit('bill');

DROP TRIGGER IF EXISTS trg_quote_header_audit ON public.quotes;
CREATE TRIGGER trg_quote_header_audit AFTER UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public._trg_transaction_header_audit('quote');

DROP TRIGGER IF EXISTS trg_so_header_audit ON public.sales_orders;
CREATE TRIGGER trg_so_header_audit AFTER UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public._trg_transaction_header_audit('sales_order');

DROP TRIGGER IF EXISTS trg_po_header_audit ON public.purchase_orders;
CREATE TRIGGER trg_po_header_audit AFTER UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public._trg_transaction_header_audit('purchase_order');

-- =============================================================
-- 5. PACKAGE PDF DATA HELPER
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_package_pdf_data(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb; v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.packages WHERE id = _id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Package not found'; END IF;
  IF NOT is_tenant_member(auth.uid(), v_tenant) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT jsonb_build_object(
    'package', to_jsonb(p),
    'tenant', to_jsonb(t),
    'sales_order', to_jsonb(so),
    'customer', to_jsonb(c),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', COALESCE(i.name, pi.description, ''),
        'description', pi.description,
        'quantity', pi.quantity,
        'unit', COALESCE(i.unit, 'pcs')
      ) ORDER BY pi.position)
      FROM public.package_items pi
      LEFT JOIN public.items i ON i.id = pi.item_id
      WHERE pi.package_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.packages p
  LEFT JOIN public.tenants t ON t.id = p.tenant_id
  LEFT JOIN public.sales_orders so ON p.source_type = 'sales_order' AND so.id = p.source_id
  LEFT JOIN public.customers c ON c.id = so.customer_id
  WHERE p.id = _id;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_package_pdf_data(uuid) TO authenticated;
