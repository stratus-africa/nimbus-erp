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

    // Resolve current tenant + admin check via RPC
    const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant");
    if (tErr || !tenantId) throw new Error("No current tenant");

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user: userId,
      _tenant: tenantId,
      _role: "company_admin",
    });
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user: userId });
    if (!isAdmin && !isSuper) throw new Error("Not authorized");

    // Send Supabase invitation email
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      data.redirectTo ? { redirectTo: data.redirectTo } : undefined,
    );
    // "User already registered" is fine — we still record the invitation so
    // the tenant/role gets attached.
    if (inviteErr && !/already/i.test(inviteErr.message)) {
      throw new Error(inviteErr.message);
    }

    // Record invite + attach if user already exists
    const { data: invId, error: rpcErr } = await supabase.rpc("invite_tenant_user", {
      _email: data.email,
      _role: data.role as any,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { invitationId: invId as string, alreadyRegistered: !!inviteErr };
  });
