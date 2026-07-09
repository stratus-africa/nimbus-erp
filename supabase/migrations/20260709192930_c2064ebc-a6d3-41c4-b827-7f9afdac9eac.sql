
CREATE TABLE public.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  credit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','applied','void')),
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  source_invoice_id UUID REFERENCES public.invoices(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, credit_note_number)
);
CREATE INDEX idx_credit_notes_tenant ON public.credit_notes(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_credit_notes_customer ON public.credit_notes(customer_id) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_notes_tenant" ON public.credit_notes FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_credit_notes_updated BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.credit_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  description TEXT,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_credit_note_lines_cn ON public.credit_note_lines(credit_note_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_lines TO authenticated;
GRANT ALL ON public.credit_note_lines TO service_role;
ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cnl_tenant" ON public.credit_note_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.credit_notes c WHERE c.id = credit_note_id AND public.is_tenant_member(auth.uid(), c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.credit_notes c WHERE c.id = credit_note_id AND public.is_tenant_member(auth.uid(), c.tenant_id)));

-- Seed numbering series for existing tenants
INSERT INTO public.numbering_series (tenant_id, doc_type, prefix, next_number)
SELECT id, 'credit_note', 'CN-', 1 FROM public.tenants
ON CONFLICT (tenant_id, doc_type) DO NOTHING;
