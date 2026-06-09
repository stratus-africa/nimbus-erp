
REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.provision_tenant(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_doc_number(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.switch_tenant(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant() TO authenticated;

-- Restrict tenant insert to authenticated users (not anon)
DROP POLICY IF EXISTS "tenants_insert_any" ON public.tenants;
CREATE POLICY "tenants_insert_auth" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
