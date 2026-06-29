
-- Add persistence columns for item form
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS hs_code TEXT,
  ADD COLUMN IF NOT EXISTS sales_account_id UUID REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS purchase_account_id UUID REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS sales_tax_rate_id UUID REFERENCES public.tax_rates(id),
  ADD COLUMN IF NOT EXISTS purchase_tax_rate_id UUID REFERENCES public.tax_rates(id),
  ADD COLUMN IF NOT EXISTS preferred_vendor_id UUID REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS valuation_method TEXT;

-- RPC: delete item, blocked if any transactions reference it
CREATE OR REPLACE FUNCTION public.delete_item(_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_count INT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.items WHERE id = _id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_tenant) THEN
    RAISE EXCEPTION 'Not authorized';
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
    RAISE EXCEPTION 'Cannot delete: item is used in % transaction(s) (quotes, orders, invoices, bills, adjustments, or production). Archive it instead.', v_count
      USING ERRCODE = 'restrict_violation';
  END IF;

  UPDATE public.items SET deleted_at = now() WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_item(UUID) TO authenticated;
