# RBAC & Users Management — Full Implementation Plan

This is a large, cross-cutting change (users, roles, permissions, audit, guards). Below is the plan I'll execute end-to-end. Please review before I proceed.

## 1. Database changes (single migration)

**New tables**

- `custom_roles` — tenant-defined roles (name, description, cloned_from, is_system=false, created_by).
- `role_permissions` — per-role permission grid. Columns: `tenant_id`, `role_key` (text — either an `app_role` enum value or a `custom_roles.id`), `module` (text: items, invoices, sales_orders, purchase_orders, bills, quotes, transfer_orders, warehouses, expenses, customers, suppliers, banking, chart_of_accounts, reports, users, roles, settings), `can_view`, `can_create`, `can_edit`, `can_delete`, `can_approve`, `can_export`. Unique `(tenant_id, role_key, module)`.
- `user_status` on `tenant_members` — `active | suspended`, plus `suspended_at`, `suspended_by`.

**New / updated functions**

- `has_permission(_user uuid, _tenant uuid, _module text, _action text) returns boolean` — resolves all roles held by the user for that tenant, unions permissions, treats `company_admin` / `super_admin` as full-access, and honours `is_active` on the membership.
- `invite_tenant_user(_email text, _role_key text) returns uuid` — SECURITY DEFINER; company_admin-only; inserts pending `tenant_members` + `user_roles` row keyed on email until the auth user exists (holding table `pending_invitations`).
- `set_user_status(_user uuid, _tenant uuid, _status text)` — writes `tenant_members.status` and audit_logs entry.
- `assign_user_role(_user uuid, _tenant uuid, _role text)` — replaces the user's tenant-scoped role rows and audits.
- Role CRUD helpers `create_custom_role`, `update_custom_role`, `clone_role`, `delete_custom_role` — audit each action.

**Seed defaults**: on `provision_tenant`, seed `role_permissions` with sensible defaults for the built-in enum roles across every module.

## 2. Server functions (`src/lib/*.functions.ts`)

All authenticated (`requireSupabaseAuth`), all admin-gated where mutating:

- `inviteUser({ email, roleKey })` — calls `supabaseAdmin.auth.admin.inviteUserByEmail`, then `invite_tenant_user` RPC to record membership/role, then audit.
- `setUserStatus({ userId, status })`, `assignUserRole({ userId, roleKey })`.
- `saveRolePermissions({ roleKey, rows })`, `createRole`, `updateRole`, `cloneRole`, `deleteRole`.
- `listAuditForRole(roleKey)` — for the role detail timeline.

RBAC enforcement middleware `requirePermission(module, action)` composes with `requireSupabaseAuth` and calls `has_permission`. Attach it to any server fn that mutates a module (invoices, items, etc.) — start with the fns already in use; catalog covered below.

## 3. Front-end changes

**`/settings/users`**
- "Invite User" button opens dialog: email, role select (populated from enum + tenant custom_roles), submit → `inviteUser`.
- Row actions (3-dot): Change Role (submenu of roles, saves via `assignUserRole` + toast), Activate / Suspend (toggle), Remove.
- Status column reflects `tenant_members.status`. Filter view "Suspended Users" wired up.

**`/settings/roles`**
- New Role button → dialog (name, description, clone from). Opens editor.
- Row actions on custom roles: Edit / Clone / Delete → real handlers, confirmations for delete.
- Row click on any role → `/settings/roles/$roleKey` detail page.

**`/settings/roles/$roleKey`** (new)
- Header: name, description, badge (System / Custom).
- Permissions matrix: rows = modules, columns = View / Create / Edit / Delete / Approve / Export. Checkboxes bound to `role_permissions`. Save writes the whole grid.
- Timeline tab: audit_logs filtered to `entity_type='roles'` and this role.

**Route guards**
- Client-side `useHasPermission(module, action)` (reads a cached `role_permissions` snapshot for current user's roles) — used to hide nav items and disable action buttons across the app.
- `_authenticated` child layouts for admin-only surfaces (`/settings/users`, `/settings/roles`) already gated by company_admin via `has_role`; extend with `has_permission('users','view')` / `('roles','view')` fallback so custom roles can be granted access.

## 4. Audit logging

Every mutating action (invite, status change, role change, role CRUD, permission save) inserts an `audit_logs` row: `entity_type` = `tenant_members` or `roles`, plus a human summary + JSONB details (before/after). Users page adds an audit drawer per member; role detail page shows its timeline.

## 5. Scope of RBAC enforcement in this pass

Enforce `has_permission` on:
- All existing transfer-order RPCs (already partial via `can_transfer_action` — align to `has_permission`).
- Item delete, invoice create/update/delete, sales-order confirm/ship, bill approve/pay, expense approve, journal-entry post, user/role management. Everything else stays functional but not yet guarded — I'll list what's covered vs. deferred in the final message.

## Notes

- No native "user suspension" in Supabase Auth is used — status lives on `tenant_members` so multi-tenant is respected. Suspended users still authenticate but the `_authenticated` gate redirects them to `/suspended`.
- All new tables get GRANTs (`authenticated`, `service_role`) and RLS scoped via `is_tenant_member` + `has_role('company_admin')`.
- No changes to `src/integrations/supabase/*` generated files; types will regenerate after migration.

## Confirm before I start

Please confirm:
1. OK to add `custom_roles`, `role_permissions`, `pending_invitations` tables + membership `status` column.
2. OK that "suspended" is enforced at app-level (not by disabling the Supabase auth user).
3. OK to enforce RBAC on the modules listed in §5 in this pass and defer the rest to a follow-up.
