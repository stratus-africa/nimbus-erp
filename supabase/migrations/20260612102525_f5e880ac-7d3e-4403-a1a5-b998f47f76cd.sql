
-- 1) tenant_settings
CREATE TABLE public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  namespace text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, namespace)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_settings tenant access" ON public.tenant_settings
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_tenant_settings_updated BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) custom_fields
CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity text NOT NULL,
  field_key text NOT NULL,
  label text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('text','number','date','boolean','select')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  default_value text,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity, field_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_fields TO authenticated;
GRANT ALL ON public.custom_fields TO service_role;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_fields tenant access" ON public.custom_fields
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_custom_fields_updated BEFORE UPDATE ON public.custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) validation_rules
CREATE TABLE public.validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity text NOT NULL,
  name text NOT NULL,
  field_key text NOT NULL,
  operator text NOT NULL CHECK (operator IN ('eq','neq','gt','lt','gte','lte','between','regex','required','min_length','max_length')),
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  error_message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_rules TO authenticated;
GRANT ALL ON public.validation_rules TO service_role;
ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "validation_rules tenant access" ON public.validation_rules
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_validation_rules_updated BEFORE UPDATE ON public.validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) record_locks
CREATE TABLE public.record_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity text NOT NULL,
  name text NOT NULL,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  lock_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  roles_allowed text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_locks TO authenticated;
GRANT ALL ON public.record_locks TO service_role;
ALTER TABLE public.record_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "record_locks tenant access" ON public.record_locks
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_record_locks_updated BEFORE UPDATE ON public.record_locks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) custom_buttons
CREATE TABLE public.custom_buttons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity text NOT NULL,
  label text NOT NULL,
  placement text NOT NULL CHECK (placement IN ('detail','list','both')) DEFAULT 'detail',
  action_type text NOT NULL CHECK (action_type IN ('url','webhook','copy')),
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon text,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_buttons TO authenticated;
GRANT ALL ON public.custom_buttons TO service_role;
ALTER TABLE public.custom_buttons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_buttons tenant access" ON public.custom_buttons
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_custom_buttons_updated BEFORE UPDATE ON public.custom_buttons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) related_lists
CREATE TABLE public.related_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity text NOT NULL,
  label text NOT NULL,
  related_entity text NOT NULL,
  filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.related_lists TO authenticated;
GRANT ALL ON public.related_lists TO service_role;
ALTER TABLE public.related_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "related_lists tenant access" ON public.related_lists
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_related_lists_updated BEFORE UPDATE ON public.related_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) items: add archived_at
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_at timestamptz;
