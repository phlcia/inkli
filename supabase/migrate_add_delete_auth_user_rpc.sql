-- SECURITY DEFINER function so the edge function (service role) can delete
-- directly from auth.users without going through GoTrue's admin.deleteUser,
-- which has an internal 500 bug for some users.
CREATE OR REPLACE FUNCTION public.delete_auth_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Only the service role should be able to call this
REVOKE ALL ON FUNCTION public.delete_auth_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_auth_user(uuid) TO service_role;
