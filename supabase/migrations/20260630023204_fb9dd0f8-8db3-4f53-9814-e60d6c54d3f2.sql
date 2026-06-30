
CREATE OR REPLACE FUNCTION public.can_transfer_action(_tenant UUID, _action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_roles TEXT[];
  v_user_roles TEXT[];
  v_defaults JSONB := jsonb_build_object(
    'request', jsonb_build_array('company_admin','inventory','sales','purchasing'),
    'approve', jsonb_build_array('company_admin'),
    'confirm', jsonb_build_array('company_admin','inventory'),
    'ship',    jsonb_build_array('company_admin','inventory'),
    'receive', jsonb_build_array('company_admin','inventory'),
    'cancel',  jsonb_build_array('company_admin')
  );
  v_cfg JSONB;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN TRUE; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _tenant) THEN RETURN FALSE; END IF;

  SELECT (settings -> 'permissions') INTO v_cfg
    FROM public.tenant_settings WHERE tenant_id = _tenant AND namespace = 'transfer_orders' LIMIT 1;

  IF v_cfg IS NULL OR v_cfg->_action IS NULL THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_defaults->_action)) INTO v_roles;
  ELSE
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_cfg->_action)) INTO v_roles;
  END IF;

  SELECT ARRAY(SELECT role::text FROM public.user_roles
               WHERE user_id = auth.uid() AND (tenant_id = _tenant OR role = 'super_admin'))
  INTO v_user_roles;

  RETURN v_user_roles && v_roles OR 'company_admin' = ANY(v_user_roles);
END $$;
