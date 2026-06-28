
CREATE POLICY "expense_receipts_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts'
         AND public.is_tenant_member(auth.uid(), (split_part(name,'/',1))::uuid));
CREATE POLICY "expense_receipts_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts'
              AND public.is_tenant_member(auth.uid(), (split_part(name,'/',1))::uuid));
CREATE POLICY "expense_receipts_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts'
         AND public.is_tenant_member(auth.uid(), (split_part(name,'/',1))::uuid));
CREATE POLICY "expense_receipts_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts'
         AND public.is_tenant_member(auth.uid(), (split_part(name,'/',1))::uuid));
