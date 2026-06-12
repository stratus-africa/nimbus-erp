
-- Extend item_type enum
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'composite';
ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS 'assembly';

-- composite_items
CREATE TABLE public.composite_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  composite_type TEXT NOT NULL DEFAULT 'kit' CHECK (composite_type IN ('kit','assembly')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','draft')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.composite_items TO authenticated;
GRANT ALL ON public.composite_items TO service_role;
ALTER TABLE public.composite_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "composite_items_tenant" ON public.composite_items
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_composite_items_updated BEFORE UPDATE ON public.composite_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_composite_items_tenant ON public.composite_items(tenant_id);

-- composite_item_components
CREATE TABLE public.composite_item_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  composite_item_id UUID NOT NULL REFERENCES public.composite_items(id) ON DELETE CASCADE,
  component_item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (composite_item_id, component_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.composite_item_components TO authenticated;
GRANT ALL ON public.composite_item_components TO service_role;
ALTER TABLE public.composite_item_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "composite_item_components_tenant" ON public.composite_item_components
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_composite_item_components_updated BEFORE UPDATE ON public.composite_item_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_cic_composite ON public.composite_item_components(composite_item_id);
CREATE INDEX idx_cic_component ON public.composite_item_components(component_item_id);

-- Prevent self-reference
CREATE OR REPLACE FUNCTION public.composite_component_validate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_parent UUID;
BEGIN
  SELECT parent_item_id INTO v_parent FROM public.composite_items WHERE id = NEW.composite_item_id;
  IF v_parent = NEW.component_item_id THEN
    RAISE EXCEPTION 'A composite item cannot contain itself';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cic_validate BEFORE INSERT OR UPDATE ON public.composite_item_components
  FOR EACH ROW EXECUTE FUNCTION public.composite_component_validate();

-- assembly_orders
CREATE TABLE public.assembly_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number TEXT,
  assembly_item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','cancelled')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_orders TO authenticated;
GRANT ALL ON public.assembly_orders TO service_role;
ALTER TABLE public.assembly_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assembly_orders_tenant" ON public.assembly_orders
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_assembly_orders_updated BEFORE UPDATE ON public.assembly_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_assembly_orders_tenant ON public.assembly_orders(tenant_id);

-- assembly_consumptions
CREATE TABLE public.assembly_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  assembly_order_id UUID NOT NULL REFERENCES public.assembly_orders(id) ON DELETE CASCADE,
  component_item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity_used NUMERIC(14,4) NOT NULL,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_consumptions TO authenticated;
GRANT ALL ON public.assembly_consumptions TO service_role;
ALTER TABLE public.assembly_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assembly_consumptions_tenant" ON public.assembly_consumptions
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX idx_assembly_consumptions_order ON public.assembly_consumptions(assembly_order_id);

-- Seed numbering series for assembly
INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number)
SELECT id, 'assembly', 'AS-', 1 FROM public.tenants
ON CONFLICT DO NOTHING;
