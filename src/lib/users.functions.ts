import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Invite a user to the current tenant by email. Uses the Supabase Auth Admin
 * API to send the invitation email, then records a pending_invitations row so
 * the user auto-joins on signup. Company admin only.
 */
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; role: string; redirectTo?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant");
    if (tErr || !tenantId) throw new Error("No current tenant");

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user: userId,
      _tenant: tenantId,
      _role: "company_admin",
    });
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user: userId });
    if (!isAdmin && !isSuper) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      data.redirectTo ? { redirectTo: data.redirectTo } : undefined,
    );
    if (inviteErr && !/already/i.test(inviteErr.message)) {
      throw new Error(inviteErr.message);
    }

    const { data: invId, error: rpcErr } = await supabase.rpc("invite_tenant_user", {
      _email: data.email,
      _role: data.role as any,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { invitationId: invId as string, alreadyRegistered: !!inviteErr };
  });

/**
 * Create a user directly with email + password (auto-confirmed) and attach them
 * to the current tenant with the given role. Company admin only.
 */
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { email: string; password: string; fullName?: string; role: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (!data.email?.trim()) throw new Error("Email is required");
    if (!data.password || data.password.length < 8)
      throw new Error("Password must be at least 8 characters");

    const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant");
    if (tErr || !tenantId) throw new Error("No current tenant");

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user: userId,
      _tenant: tenantId,
      _role: "company_admin",
    });
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user: userId });
    if (!isAdmin && !isSuper) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim(),
      password: data.password,
      email_confirm: true,
      user_metadata: data.fullName ? { full_name: data.fullName } : undefined,
    });
    if (cErr) throw new Error(cErr.message);

    // Attach to tenant + role via the same helper used by invitations.
    const { error: rpcErr } = await supabase.rpc("invite_tenant_user", {
      _email: data.email.trim(),
      _role: data.role as any,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    return { userId: created.user?.id ?? null };
  });
