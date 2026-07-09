
-- 1) Helper: current-user suspension status
CREATE OR REPLACE FUNCTION public.is_current_user_suspended()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tenant_members tm
      JOIN public.profiles p ON p.user_id = tm.user_id
     WHERE tm.user_id = auth.uid()
       AND tm.tenant_id = p.current_tenant_id
       AND tm.status = 'suspended'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_suspended() TO authenticated;

-- 2) Retrofit permission checks into existing mutation RPCs
CREATE OR REPLACE FUNCTION public.delete_item(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant UUID;
  v_count INT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.items WHERE id = _id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_tenant) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT public.has_permission(auth.uid(), v_tenant, 'items', 'delete') THEN
    RAISE EXCEPTION 'You do not have permission to delete items';
  END IF;

  SELECT
    (SELECT COUNT(*) FROM public.quote_lines WHERE item_id = _id)
  + (SELECT COUNT(*) FROM public.sales_order_lines WHERE item_id = _id)
  + (SELECT COUNT(*) FROM public.invoice_lines WHERE item_id = _id)
  + (SELECT COUNT(*) FROM public.purchase_order_lines WHERE item_id = _id)
  + (SELECT COUNT(*) FROM public.bill_lines WHERE item_id = _id)
  + (SELECT COUNT(*) FROM public.inventory_adjustment_lines WHERE item_id = _id)
  + (SELECT COUNT(*) FROM public.assembly_orders WHERE assembly_item_id = _id)
  + (SELECT COUNT(*) FROM public.assembly_consumptions WHERE component_item_id = _id)
  + (SELECT COUNT(*) FROM public.composite_items WHERE parent_item_id = _id)
  + (SELECT COUNT(*) FROM public.composite_item_components WHERE component_item_id = _id)
  INTO v_count;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete: item is used in % transaction(s) (quotes, orders, invoices, bills, adjustments, or production). Archive it instead.', v_count;
  END IF;

  DELETE FROM public.items WHERE id = _id;
END $function$;

CREATE OR REPLACE FUNCTION public.mark_expense_paid(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_exp RECORD;
BEGIN
  SELECT * INTO v_exp FROM public.expenses WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_exp.tenant_id) THEN RAISE EXCEPTION 'Not a tenant member'; END IF;
  IF NOT public.has_permission(auth.uid(), v_exp.tenant_id, 'expenses', 'edit') THEN
    RAISE EXCEPTION 'You do not have permission to update expenses';
  END IF;
  IF v_exp.status <> 'approved' THEN RAISE EXCEPTION 'Only approved expenses can be marked paid'; END IF;
  UPDATE public.expenses SET status='paid', paid_at=now() WHERE id = _id;
END $function$;

CREATE OR REPLACE FUNCTION public.reject_expense(_id uuid, _comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_exp RECORD;
BEGIN
  SELECT * INTO v_exp FROM public.expenses WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_exp.tenant_id) THEN RAISE EXCEPTION 'Not a tenant member'; END IF;
  IF NOT public.has_permission(auth.uid(), v_exp.tenant_id, 'expenses', 'approve') THEN
    RAISE EXCEPTION 'You do not have permission to approve/reject expenses';
  END IF;
  UPDATE public.expenses SET status='rejected' WHERE id = _id;
  INSERT INTO public.expense_approvals(expense_id, approver_id, status, comments, acted_at)
  VALUES (_id, auth.uid(), 'rejected', _comment, now());
END $function$;

-- Wrap approve_expense with permission check
CREATE OR REPLACE FUNCTION public.approve_expense(_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT public.has_permission(auth.uid(), v_exp.tenant_id, 'expenses', 'approve') THEN
    RAISE EXCEPTION 'You do not have permission to approve expenses';
  END IF;
  IF v_exp.status NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'Cannot approve from status %', v_exp.status; END IF;
  IF v_exp.payment_account_id IS NULL THEN RAISE EXCEPTION 'Payment account is required to approve'; END IF;

  v_entry_number := public.next_doc_number(v_exp.tenant_id, 'journal');
  INSERT INTO public.journal_entries(tenant_id, entry_number, entry_date, reference, description, source_type, source_id, created_by)
  VALUES (v_exp.tenant_id, v_entry_number, v_exp.expense_date, v_exp.expense_number,
          COALESCE(v_exp.notes, 'Expense ' || v_exp.expense_number), 'expenses', v_exp.id, auth.uid())
  RETURNING id INTO v_entry_id;

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

  IF v_pos = 0 THEN
    IF v_exp.expense_account_id IS NULL THEN RAISE EXCEPTION 'Expense account required'; END IF;
    INSERT INTO public.journal_lines(entry_id, account_id, description, debit, credit, position)
    VALUES (v_entry_id, v_exp.expense_account_id, v_exp.notes, v_exp.total_amount, 0, 0);
    v_total := v_exp.total_amount;
    v_pos := 1;
  END IF;

  INSERT INTO public.journal_lines(entry_id, account_id, description, debit, credit, position)
  VALUES (v_entry_id, v_exp.payment_account_id, 'Payment for ' || v_exp.expense_number, 0, v_total, v_pos);

  UPDATE public.journal_entries SET total_debit = v_total, total_credit = v_total WHERE id = v_entry_id;

  UPDATE public.expenses
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(), journal_entry_id = v_entry_id
    WHERE id = _id;

  INSERT INTO public.expense_approvals(expense_id, approver_id, status, acted_at)
  VALUES (_id, auth.uid(), 'approved', now());

  RETURN v_entry_id;
END $function$;

-- 3) BEFORE-trigger RBAC gates for invoice/bill/item/expense direct mutations
CREATE OR REPLACE FUNCTION public._enforce_rbac()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module text := TG_ARGV[0];
  v_tenant uuid;
  v_action text;
BEGIN
  -- Skip for super admin & when no auth (e.g. service_role, triggers from other definer functions have auth.uid())
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF public.is_super_admin(auth.uid()) THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN v_action := 'create'; v_tenant := NEW.tenant_id;
  ELSIF TG_OP = 'UPDATE' THEN v_action := 'edit'; v_tenant := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN v_action := 'delete'; v_tenant := OLD.tenant_id;
  END IF;

  -- Company admins always allowed; others must have explicit permission
  IF public.has_role(auth.uid(), v_tenant, 'company_admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT public.has_permission(auth.uid(), v_tenant, v_module, v_action) THEN
    RAISE EXCEPTION 'Permission denied: % on %', v_action, v_module USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS rbac_invoices ON public.invoices;
CREATE TRIGGER rbac_invoices BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rbac('invoices');

DROP TRIGGER IF EXISTS rbac_bills ON public.bills;
CREATE TRIGGER rbac_bills BEFORE INSERT OR UPDATE OR DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rbac('bills');

DROP TRIGGER IF EXISTS rbac_items ON public.items;
CREATE TRIGGER rbac_items BEFORE INSERT OR UPDATE OR DELETE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rbac('items');

DROP TRIGGER IF EXISTS rbac_expenses ON public.expenses;
CREATE TRIGGER rbac_expenses BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rbac('expenses');

-- 4) Enhanced complete_assembly_order: warehouse_stock + inventory_transactions + audit log
CREATE OR REPLACE FUNCTION public.complete_assembly_order(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.assembly_orders%ROWTYPE;
  v_comp RECORD;
  v_qty_used NUMERIC;
  v_cost NUMERIC;
  v_total_cost NUMERIC := 0;
  v_parent_stock NUMERIC;
  v_parent_cost NUMERIC;
  v_new_cost NUMERIC;
  v_wh UUID;
  v_actor_name TEXT;
BEGIN
  SELECT * INTO v_order FROM public.assembly_orders WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assembly order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_order.tenant_id) THEN
    RAISE EXCEPTION 'Not a tenant member';
  END IF;
  IF v_order.status = 'completed' THEN RAISE EXCEPTION 'Already completed'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'Order is cancelled'; END IF;

  -- Pick a warehouse (primary else first active)
  SELECT id INTO v_wh
    FROM public.locations
   WHERE tenant_id = v_order.tenant_id
     AND COALESCE(is_active, true) = true
   ORDER BY is_primary DESC NULLS LAST, created_at ASC
   LIMIT 1;

  FOR v_comp IN
    SELECT cic.component_item_id, cic.quantity AS comp_qty, i.cost_price, i.stock_on_hand
    FROM public.composite_items ci
    JOIN public.composite_item_components cic ON cic.composite_item_id = ci.id
    JOIN public.items i ON i.id = cic.component_item_id
    WHERE ci.parent_item_id = v_order.assembly_item_id
      AND ci.tenant_id = v_order.tenant_id
  LOOP
    v_qty_used := v_comp.comp_qty * v_order.quantity;
    v_cost := COALESCE(v_comp.cost_price, 0);
    v_total_cost := v_total_cost + v_qty_used * v_cost;

    UPDATE public.items
      SET stock_on_hand = COALESCE(stock_on_hand,0) - v_qty_used
      WHERE id = v_comp.component_item_id;

    INSERT INTO public.assembly_consumptions(tenant_id, assembly_order_id, component_item_id, quantity_used, unit_cost)
    VALUES (v_order.tenant_id, v_order.id, v_comp.component_item_id, v_qty_used, v_cost);

    IF v_wh IS NOT NULL THEN
      PERFORM public._ws_upsert(v_order.tenant_id, v_wh, v_comp.component_item_id);
      UPDATE public.warehouse_stock
         SET quantity = quantity - v_qty_used, updated_at = now()
       WHERE warehouse_id = v_wh AND item_id = v_comp.component_item_id;
      INSERT INTO public.inventory_transactions(tenant_id, warehouse_id, item_id, transaction_type, quantity, reference_type, reference_id, created_by, notes)
      VALUES (v_order.tenant_id, v_wh, v_comp.component_item_id, 'ASSEMBLY_OUT', -v_qty_used, 'assembly_orders', v_order.id, auth.uid(),
              'Consumed for production order ' || COALESCE(v_order.order_number, v_order.id::text));
    END IF;
  END LOOP;

  SELECT COALESCE(stock_on_hand,0), COALESCE(cost_price,0)
    INTO v_parent_stock, v_parent_cost
    FROM public.items WHERE id = v_order.assembly_item_id FOR UPDATE;

  IF (v_parent_stock + v_order.quantity) > 0 THEN
    v_new_cost := (v_parent_stock * v_parent_cost + v_total_cost) / (v_parent_stock + v_order.quantity);
  ELSE
    v_new_cost := v_parent_cost;
  END IF;

  UPDATE public.items
    SET stock_on_hand = v_parent_stock + v_order.quantity,
        cost_price = v_new_cost
    WHERE id = v_order.assembly_item_id;

  IF v_wh IS NOT NULL THEN
    PERFORM public._ws_upsert(v_order.tenant_id, v_wh, v_order.assembly_item_id);
    UPDATE public.warehouse_stock
       SET quantity = quantity + v_order.quantity, updated_at = now()
     WHERE warehouse_id = v_wh AND item_id = v_order.assembly_item_id;
    INSERT INTO public.inventory_transactions(tenant_id, warehouse_id, item_id, transaction_type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_order.tenant_id, v_wh, v_order.assembly_item_id, 'ASSEMBLY_IN', v_order.quantity, 'assembly_orders', v_order.id, auth.uid(),
            'Produced by production order ' || COALESCE(v_order.order_number, v_order.id::text));
  END IF;

  UPDATE public.assembly_orders
    SET status = 'completed', completed_at = now()
    WHERE id = v_order.id;

  SELECT COALESCE(full_name, email, 'System') INTO v_actor_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_order.tenant_id, auth.uid(), COALESCE(v_actor_name,'System'), 'assembly_orders', v_order.id,
          'production_completed',
          format('%s completed production order %s (%s units)', COALESCE(v_actor_name,'System'),
                 COALESCE(v_order.order_number, v_order.id::text), v_order.quantity::text),
          jsonb_build_object('quantity', v_order.quantity, 'total_component_cost', v_total_cost,
                             'new_unit_cost', v_new_cost, 'warehouse_id', v_wh));
END $function$;

-- 5) Audit trail for production order lifecycle
CREATE OR REPLACE FUNCTION public._audit_assembly_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name TEXT;
  v_action TEXT;
  v_summary TEXT;
  v_details JSONB;
BEGIN
  SELECT COALESCE(full_name, email, 'System') INTO v_actor_name FROM public.profiles WHERE user_id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := 'production_created';
    v_summary := format('%s created production order %s', COALESCE(v_actor_name,'System'), COALESCE(NEW.order_number, NEW.id::text));
    v_details := jsonb_build_object('order_number', NEW.order_number, 'status', NEW.status, 'quantity', NEW.quantity, 'item_id', NEW.assembly_item_id);
    INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
    VALUES (NEW.tenant_id, auth.uid(), COALESCE(v_actor_name,'System'), 'assembly_orders', NEW.id, v_action, v_summary, v_details);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := 'production_status_changed';
      v_summary := format('%s changed status of %s from %s to %s',
                          COALESCE(v_actor_name,'System'),
                          COALESCE(NEW.order_number, NEW.id::text), OLD.status, NEW.status);
      v_details := jsonb_build_object('previous_status', OLD.status, 'new_status', NEW.status);
      INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
      VALUES (NEW.tenant_id, auth.uid(), COALESCE(v_actor_name,'System'), 'assembly_orders', NEW.id, v_action, v_summary, v_details);
    ELSIF (NEW.quantity IS DISTINCT FROM OLD.quantity) OR (NEW.notes IS DISTINCT FROM OLD.notes) OR (NEW.assembly_item_id IS DISTINCT FROM OLD.assembly_item_id) THEN
      v_action := 'production_edited';
      v_summary := format('%s edited production order %s', COALESCE(v_actor_name,'System'), COALESCE(NEW.order_number, NEW.id::text));
      v_details := jsonb_build_object(
        'previous', jsonb_build_object('quantity', OLD.quantity, 'notes', OLD.notes, 'item_id', OLD.assembly_item_id),
        'new',      jsonb_build_object('quantity', NEW.quantity, 'notes', NEW.notes, 'item_id', NEW.assembly_item_id)
      );
      INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
      VALUES (NEW.tenant_id, auth.uid(), COALESCE(v_actor_name,'System'), 'assembly_orders', NEW.id, v_action, v_summary, v_details);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'production_deleted';
    v_summary := format('%s deleted production order %s', COALESCE(v_actor_name,'System'), COALESCE(OLD.order_number, OLD.id::text));
    v_details := jsonb_build_object('order_number', OLD.order_number, 'status', OLD.status, 'quantity', OLD.quantity, 'item_id', OLD.assembly_item_id);
    INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
    VALUES (OLD.tenant_id, auth.uid(), COALESCE(v_actor_name,'System'), 'assembly_orders', OLD.id, v_action, v_summary, v_details);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS audit_assembly_orders ON public.assembly_orders;
CREATE TRIGGER audit_assembly_orders
AFTER INSERT OR UPDATE OR DELETE ON public.assembly_orders
FOR EACH ROW EXECUTE FUNCTION public._audit_assembly_order();
