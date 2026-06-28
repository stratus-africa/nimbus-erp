
REVOKE EXECUTE ON FUNCTION public.approve_expense(UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_expense(UUID, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_expense_paid(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.approve_expense(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_expense(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_expense_paid(UUID) TO authenticated;
