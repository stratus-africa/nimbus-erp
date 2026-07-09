
-- 1. tenant_members status
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid;

ALTER TABLE public.tenant_members
  DROP CONSTRAINT IF EXISTS tenant_members_status_check;
ALTER TABLE public.tenant_members
  ADD CONSTRAINT tenant_members_status_check CHECK (status IN ('active','suspended'));

-- 2. custom_roles
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cloned_from text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read custom_roles" ON public.custom_roles
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Admins manage custom_roles" ON public.custom_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'company_admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'company_admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER custom_roles_updated_at BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_key text NOT NULL,  -- app_role enum value OR custom_roles.id::text
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, role_key, module)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Admins manage role_permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'company_admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'company_admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER role_permissions_updated_at BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. pending_invitations
CREATE TABLE IF NOT EXISTS public.pending_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_key text NOT NULL,
  invited_by uuid,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(tenant_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_invitations TO authenticated;
GRANT ALL ON public.pending_invitations TO service_role;
ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage invitations" ON public.pending_invitations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'company_admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'company_admin'::app_role) OR public.is_super_admin(auth.uid()));

-- 5. has_permission
CREATE OR REPLACE FUNCTION public.has_permission(_user uuid, _tenant uuid, _module text, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_col text;
  v_result boolean;
BEGIN
  IF public.is_super_admin(_user) THEN RETURN true; END IF;

  SELECT status INTO v_status FROM public.tenant_members WHERE user_id = _user AND tenant_id = _tenant;
  IF v_status IS NULL OR v_status <> 'active' THEN RETURN false; END IF;

  IF public.has_role(_user, _tenant, 'company_admin'::app_role) THEN RETURN true; END IF;

  v_col := CASE _action
    WHEN 'view' THEN 'can_view'
    WHEN 'create' THEN 'can_create'
    WHEN 'edit' THEN 'can_edit'
    WHEN 'delete' THEN 'can_delete'
    WHEN 'approve' THEN 'can_approve'
    WHEN 'export' THEN 'can_export'
    ELSE NULL END;
  IF v_col IS NULL THEN RETURN false; END IF;

  EXECUTE format($q$
    SELECT COALESCE(bool_or(rp.%I), false)
    FROM public.role_permissions rp
    JOIN public.user_roles ur ON ur.role::text = rp.role_key
    WHERE ur.user_id = $1
      AND (ur.tenant_id = $2 OR ur.role = 'super_admin')
      AND rp.tenant_id = $2
      AND rp.module = $3
  $q$, v_col) INTO v_result USING _user, _tenant, _module;

  -- Also union permissions coming from custom roles (role_key = custom_roles.id)
  IF NOT COALESCE(v_result, false) THEN
    EXECUTE format($q$
      SELECT COALESCE(bool_or(rp.%I), false)
      FROM public.role_permissions rp
      WHERE rp.tenant_id = $1
        AND rp.module = $2
        AND rp.role_key IN (
          SELECT ur.role::text FROM public.user_roles ur
          WHERE ur.user_id = $3 AND (ur.tenant_id = $1 OR ur.role = 'super_admin')
        )
    $q$, v_col) INTO v_result USING _tenant, _module, _user;
  END IF;

  RETURN COALESCE(v_result, false);
END $$;

-- 6. set_user_status
CREATE OR REPLACE FUNCTION public.set_user_status(_user uuid, _tenant uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); v_prev text; v_actor_name text; v_target_name text;
BEGIN
  IF NOT (public.has_role(v_actor, _tenant, 'company_admin'::app_role) OR public.is_super_admin(v_actor)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  SELECT status INTO v_prev FROM public.tenant_members WHERE user_id=_user AND tenant_id=_tenant FOR UPDATE;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'Not a tenant member'; END IF;

  UPDATE public.tenant_members
    SET status=_status,
        suspended_at = CASE WHEN _status='suspended' THEN now() ELSE NULL END,
        suspended_by = CASE WHEN _status='suspended' THEN v_actor ELSE NULL END
    WHERE user_id=_user AND tenant_id=_tenant;

  SELECT COALESCE(full_name,email) INTO v_actor_name FROM public.profiles WHERE user_id=v_actor;
  SELECT COALESCE(full_name,email) INTO v_target_name FROM public.profiles WHERE user_id=_user;

  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (_tenant, v_actor, COALESCE(v_actor_name,'System'), 'tenant_members', _user,
          CASE WHEN _status='suspended' THEN 'user_suspended' ELSE 'user_activated' END,
          format('%s %s user %s', COALESCE(v_actor_name,'System'),
                 CASE WHEN _status='suspended' THEN 'suspended' ELSE 'activated' END,
                 COALESCE(v_target_name,'')),
          jsonb_build_object('previous_status', v_prev, 'new_status', _status));
END $$;

-- 7. assign_user_role
CREATE OR REPLACE FUNCTION public.assign_user_role(_user uuid, _tenant uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); v_prev text[]; v_actor_name text; v_target_name text;
BEGIN
  IF NOT (public.has_role(v_actor, _tenant, 'company_admin'::app_role) OR public.is_super_admin(v_actor)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT array_agg(role::text) INTO v_prev
  FROM public.user_roles WHERE user_id=_user AND tenant_id=_tenant;

  DELETE FROM public.user_roles WHERE user_id=_user AND tenant_id=_tenant AND role <> 'super_admin';
  INSERT INTO public.user_roles(user_id, tenant_id, role) VALUES (_user, _tenant, _role)
    ON CONFLICT DO NOTHING;

  SELECT COALESCE(full_name,email) INTO v_actor_name FROM public.profiles WHERE user_id=v_actor;
  SELECT COALESCE(full_name,email) INTO v_target_name FROM public.profiles WHERE user_id=_user;

  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (_tenant, v_actor, COALESCE(v_actor_name,'System'), 'tenant_members', _user, 'role_changed',
          format('%s changed role of %s to %s', COALESCE(v_actor_name,'System'), COALESCE(v_target_name,''), _role),
          jsonb_build_object('previous_roles', v_prev, 'new_role', _role));
END $$;

-- 8. invite_tenant_user
CREATE OR REPLACE FUNCTION public.invite_tenant_user(_email text, _role app_role)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); v_tenant uuid; v_existing uuid; v_inv_id uuid; v_actor_name text;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No current tenant'; END IF;
  IF NOT (public.has_role(v_actor, v_tenant, 'company_admin'::app_role) OR public.is_super_admin(v_actor)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Match to existing profile
  SELECT user_id INTO v_existing FROM public.profiles WHERE lower(email)=lower(_email) LIMIT 1;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.tenant_members(tenant_id, user_id, invited_by)
      VALUES (v_tenant, v_existing, v_actor)
      ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles(user_id, tenant_id, role)
      VALUES (v_existing, v_tenant, _role) ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.pending_invitations(tenant_id, email, role_key, invited_by)
    VALUES (v_tenant, lower(_email), _role::text, v_actor)
    ON CONFLICT (tenant_id, email) DO UPDATE
      SET role_key=EXCLUDED.role_key, invited_by=EXCLUDED.invited_by, invited_at=now(), accepted_at=NULL
    RETURNING id INTO v_inv_id;

  SELECT COALESCE(full_name,email) INTO v_actor_name FROM public.profiles WHERE user_id=v_actor;
  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_tenant, v_actor, COALESCE(v_actor_name,'System'), 'pending_invitations', v_inv_id, 'user_invited',
          format('%s invited %s as %s', COALESCE(v_actor_name,'System'), _email, _role),
          jsonb_build_object('email', _email, 'role', _role));
  RETURN v_inv_id;
END $$;

-- 9. Auto-accept invitation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  FOR r IN SELECT * FROM public.pending_invitations
           WHERE lower(email) = lower(NEW.email) AND accepted_at IS NULL LOOP
    INSERT INTO public.tenant_members(tenant_id, user_id, invited_by)
      VALUES (r.tenant_id, NEW.id, r.invited_by) ON CONFLICT DO NOTHING;
    BEGIN
      INSERT INTO public.user_roles(user_id, tenant_id, role)
        VALUES (NEW.id, r.tenant_id, r.role_key::app_role) ON CONFLICT DO NOTHING;
    EXCEPTION WHEN others THEN NULL;
    END;
    UPDATE public.pending_invitations SET accepted_at=now() WHERE id=r.id;
    UPDATE public.profiles SET current_tenant_id=r.tenant_id WHERE user_id=NEW.id AND current_tenant_id IS NULL;
  END LOOP;
  RETURN NEW;
END $$;

-- 10. Role CRUD
CREATE OR REPLACE FUNCTION public.create_custom_role(_name text, _description text, _clone_from text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); v_tenant uuid; v_id uuid; v_actor_name text;
BEGIN
  v_tenant := public.current_tenant();
  IF NOT (public.has_role(v_actor, v_tenant, 'company_admin'::app_role) OR public.is_super_admin(v_actor)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.custom_roles(tenant_id, name, description, cloned_from, created_by)
    VALUES (v_tenant, _name, _description, _clone_from, v_actor) RETURNING id INTO v_id;

  IF _clone_from IS NOT NULL THEN
    INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
    SELECT tenant_id, v_id::text, module, can_view, can_create, can_edit, can_delete, can_approve, can_export
    FROM public.role_permissions WHERE tenant_id=v_tenant AND role_key=_clone_from;
  END IF;

  SELECT COALESCE(full_name,email) INTO v_actor_name FROM public.profiles WHERE user_id=v_actor;
  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_tenant, v_actor, COALESCE(v_actor_name,'System'), 'roles', v_id,
          CASE WHEN _clone_from IS NULL THEN 'role_created' ELSE 'role_cloned' END,
          format('%s %s role %s', COALESCE(v_actor_name,'System'),
                 CASE WHEN _clone_from IS NULL THEN 'created' ELSE 'cloned' END, _name),
          jsonb_build_object('name', _name, 'cloned_from', _clone_from));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_custom_role(_id uuid, _name text, _description text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); v_tenant uuid; v_actor_name text;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.custom_roles WHERE id=_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF NOT (public.has_role(v_actor, v_tenant, 'company_admin'::app_role) OR public.is_super_admin(v_actor)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.custom_roles SET name=_name, description=_description, updated_at=now() WHERE id=_id;

  SELECT COALESCE(full_name,email) INTO v_actor_name FROM public.profiles WHERE user_id=v_actor;
  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_tenant, v_actor, COALESCE(v_actor_name,'System'), 'roles', _id, 'role_updated',
          format('%s updated role %s', COALESCE(v_actor_name,'System'), _name),
          jsonb_build_object('name', _name));
END $$;

CREATE OR REPLACE FUNCTION public.delete_custom_role(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); v_tenant uuid; v_name text; v_actor_name text;
BEGIN
  SELECT tenant_id, name INTO v_tenant, v_name FROM public.custom_roles WHERE id=_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF NOT (public.has_role(v_actor, v_tenant, 'company_admin'::app_role) OR public.is_super_admin(v_actor)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.role_permissions WHERE tenant_id=v_tenant AND role_key=_id::text;
  DELETE FROM public.custom_roles WHERE id=_id;

  SELECT COALESCE(full_name,email) INTO v_actor_name FROM public.profiles WHERE user_id=v_actor;
  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_tenant, v_actor, COALESCE(v_actor_name,'System'), 'roles', _id, 'role_deleted',
          format('%s deleted role %s', COALESCE(v_actor_name,'System'), v_name),
          jsonb_build_object('name', v_name));
END $$;

CREATE OR REPLACE FUNCTION public.save_role_permissions(_role_key text, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); v_tenant uuid; v_actor_name text; r jsonb;
BEGIN
  v_tenant := public.current_tenant();
  IF NOT (public.has_role(v_actor, v_tenant, 'company_admin'::app_role) OR public.is_super_admin(v_actor)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    INSERT INTO public.role_permissions(tenant_id, role_key, module,
      can_view, can_create, can_edit, can_delete, can_approve, can_export)
    VALUES (v_tenant, _role_key, r->>'module',
      COALESCE((r->>'can_view')::boolean,false),
      COALESCE((r->>'can_create')::boolean,false),
      COALESCE((r->>'can_edit')::boolean,false),
      COALESCE((r->>'can_delete')::boolean,false),
      COALESCE((r->>'can_approve')::boolean,false),
      COALESCE((r->>'can_export')::boolean,false))
    ON CONFLICT (tenant_id, role_key, module) DO UPDATE SET
      can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create,
      can_edit=EXCLUDED.can_edit, can_delete=EXCLUDED.can_delete,
      can_approve=EXCLUDED.can_approve, can_export=EXCLUDED.can_export,
      updated_at=now();
  END LOOP;

  SELECT COALESCE(full_name,email) INTO v_actor_name FROM public.profiles WHERE user_id=v_actor;
  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_name, entity_type, entity_id, action, summary, details)
  VALUES (v_tenant, v_actor, COALESCE(v_actor_name,'System'), 'roles', NULL, 'permissions_updated',
          format('%s updated permissions for role %s', COALESCE(v_actor_name,'System'), _role_key),
          jsonb_build_object('role_key', _role_key, 'rows', _rows));
END $$;

-- 11. Seed default permissions for enum roles for every existing tenant
DO $seed$
DECLARE t RECORD; modules text[] := ARRAY[
  'items','invoices','sales_orders','purchase_orders','bills','quotes',
  'transfer_orders','warehouses','expenses','customers','suppliers',
  'banking','chart_of_accounts','reports','users','roles','settings'];
  m text;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    FOREACH m IN ARRAY modules LOOP
      -- company_admin: everything
      INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
      VALUES (t.id,'company_admin',m,true,true,true,true,true,true)
      ON CONFLICT (tenant_id, role_key, module) DO NOTHING;
      -- readonly: view + export only
      INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
      VALUES (t.id,'readonly',m,true,false,false,false,false,true)
      ON CONFLICT (tenant_id, role_key, module) DO NOTHING;
      -- accountant: all financial modules
      INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
      VALUES (t.id,'accountant',m,
        true,
        m IN ('invoices','bills','expenses','banking','chart_of_accounts'),
        m IN ('invoices','bills','expenses','banking','chart_of_accounts'),
        false,
        m IN ('invoices','bills','expenses'),
        true)
      ON CONFLICT (tenant_id, role_key, module) DO NOTHING;
      -- sales: sales pipeline
      INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
      VALUES (t.id,'sales',m,
        m IN ('items','invoices','sales_orders','quotes','customers','reports'),
        m IN ('invoices','sales_orders','quotes','customers'),
        m IN ('invoices','sales_orders','quotes','customers'),
        false, false,
        m IN ('invoices','sales_orders','quotes','customers','reports'))
      ON CONFLICT (tenant_id, role_key, module) DO NOTHING;
      -- purchasing
      INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
      VALUES (t.id,'purchasing',m,
        m IN ('items','purchase_orders','bills','suppliers','reports','expenses'),
        m IN ('purchase_orders','bills','suppliers','expenses'),
        m IN ('purchase_orders','bills','suppliers','expenses'),
        false, false,
        m IN ('purchase_orders','bills','suppliers','reports'))
      ON CONFLICT (tenant_id, role_key, module) DO NOTHING;
      -- inventory
      INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
      VALUES (t.id,'inventory',m,
        m IN ('items','transfer_orders','warehouses','reports'),
        m IN ('items','transfer_orders','warehouses'),
        m IN ('items','transfer_orders','warehouses'),
        false,
        m IN ('transfer_orders'),
        m IN ('items','transfer_orders','warehouses','reports'))
      ON CONFLICT (tenant_id, role_key, module) DO NOTHING;
    END LOOP;
  END LOOP;
END $seed$;

-- 12. Extend provision_tenant to seed permissions for new tenants
CREATE OR REPLACE FUNCTION public.provision_tenant(_name text, _slug text, _currency text DEFAULT 'USD'::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant_id UUID; v_user UUID := auth.uid(); v_plan UUID;
  modules text[] := ARRAY['items','invoices','sales_orders','purchase_orders','bills','quotes',
    'transfer_orders','warehouses','expenses','customers','suppliers','banking','chart_of_accounts',
    'reports','users','roles','settings'];
  m text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_plan FROM public.subscription_plans WHERE name='Starter' LIMIT 1;
  INSERT INTO public.tenants (name, slug, status, plan_id, base_currency)
    VALUES (_name, _slug, 'trial', v_plan, _currency) RETURNING id INTO v_tenant_id;
  INSERT INTO public.tenant_members (tenant_id, user_id) VALUES (v_tenant_id, v_user);
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (v_user, v_tenant_id, 'company_admin');
  UPDATE public.profiles SET current_tenant_id = v_tenant_id WHERE user_id = v_user;

  INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type) VALUES
    (v_tenant_id,'1000','Cash','asset'),(v_tenant_id,'1010','Bank Account','asset'),
    (v_tenant_id,'1200','Accounts Receivable','asset'),(v_tenant_id,'1300','Inventory','asset'),
    (v_tenant_id,'1500','Fixed Assets','asset'),(v_tenant_id,'2000','Accounts Payable','liability'),
    (v_tenant_id,'2100','Sales Tax Payable','liability'),(v_tenant_id,'2500','Long Term Debt','liability'),
    (v_tenant_id,'3000','Owner Equity','equity'),(v_tenant_id,'3100','Retained Earnings','equity'),
    (v_tenant_id,'4000','Sales Revenue','income'),(v_tenant_id,'4100','Service Revenue','income'),
    (v_tenant_id,'5000','Cost of Goods Sold','expense'),(v_tenant_id,'6000','Salaries & Wages','expense'),
    (v_tenant_id,'6100','Rent Expense','expense'),(v_tenant_id,'6200','Utilities','expense'),
    (v_tenant_id,'6300','Office Supplies','expense'),(v_tenant_id,'6400','Marketing','expense');
  INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number) VALUES
    (v_tenant_id,'quote','QT-',1),(v_tenant_id,'invoice','INV-',1),
    (v_tenant_id,'purchase_order','PO-',1),(v_tenant_id,'bill','BL-',1),
    (v_tenant_id,'journal','JE-',1),(v_tenant_id,'adjustment','ADJ-',1);
  INSERT INTO public.tax_rates (tenant_id, name, rate, is_default) VALUES
    (v_tenant_id,'Standard',16,true),(v_tenant_id,'Zero',0,false);

  FOREACH m IN ARRAY modules LOOP
    INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
      VALUES (v_tenant_id,'company_admin',m,true,true,true,true,true,true) ON CONFLICT DO NOTHING;
    INSERT INTO public.role_permissions(tenant_id, role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
      VALUES (v_tenant_id,'readonly',m,true,false,false,false,false,true) ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_tenant_id;
END $$;
