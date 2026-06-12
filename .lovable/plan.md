# Settings → Items: Full Implementation

## 1. Database (one migration)

**`tenant_settings`** — tenant-scoped JSONB, one row per (tenant, namespace).
- columns: `tenant_id`, `namespace text` (e.g. `'items'`), `settings jsonb`, timestamps
- unique (tenant_id, namespace); RLS: tenant members read/write

**Customization tables** — all scoped by `tenant_id` + `entity` (string; starts with `'items'`, designed to extend to invoices/bills later):

- `custom_fields` — `entity`, `field_key`, `label`, `data_type` (text/number/date/boolean/select), `options jsonb`, `required bool`, `default_value`, `position`, `is_active`
- `validation_rules` — `entity`, `name`, `field_key`, `operator` (eq/neq/gt/lt/between/regex/required), `value jsonb`, `error_message`, `is_active`
- `record_locks` — `entity`, `name`, `condition jsonb` (status/field-based), `lock_fields jsonb`, `roles_allowed app_role[]`, `is_active`
- `custom_buttons` — `entity`, `label`, `placement` (detail/list), `action_type` (url/webhook/copy), `action_config jsonb`, `icon`, `position`, `is_active`
- `related_lists` — `entity`, `label`, `related_entity`, `filter jsonb`, `columns jsonb`, `position`, `is_active`

All include `created_at`/`updated_at`, `set_updated_at` trigger, GRANT to authenticated + service_role, RLS via `is_tenant_member`.

**`items` extension** — add `archived_at timestamptz` (soft delete distinct from hard delete). Existing `is_active` stays for enable/disable.

## 2. Settings persistence

- `useItemsSettings()` hook: TanStack Query loads `tenant_settings` row for `namespace='items'`, falls back to defaults.
- Save mutation upserts JSONB. All General-tab fields live in one JSONB blob.
- Zod schema validates the blob on save with cross-field rules:
  - If `inventoryTracking=false` → `valuationMethod` forced to `'none'`, locked in UI
  - If any item with `track_inventory=true` exists → `valuationMethod` becomes read-only with explanation banner (queried alongside settings)
  - Batch tracking sub-options disabled when `batchTracking=false`
  - Reorder email required if `reorderNotify=true`

## 3. Items CRUD

**`/items` (existing page)** — polish to a real CRUD table:
- Search (name/SKU/barcode), filters (type, active/archived), sort
- Row actions menu: Edit, Archive/Unarchive, Delete (red, confirm dialog)
- "New Item" + "Edit Item" dialogs with zod validation
- Honors settings: decimal precision, dimension/weight units, duplicate-name rule, HS code field visibility, batch/serial UI

**`/settings/items` — compact embedded manager** at the bottom of the General tab:
- Mini items table (10 rows, search) with same row actions, links to full `/items`

## 4. Tabs (replace placeholders)

Each tab gets a working list + add/edit dialog backed by its table:
- **Field Customization** — list custom_fields, drag-reorder, type picker, options editor for select
- **Validation Rules** — pick field + operator + value + message
- **Record Locking** — condition builder (e.g., `status = 'archived'` → lock everything), role allowlist
- **Custom Buttons** — label + placement + action (URL template with {{sku}}, etc.)
- **Related Lists** — pick related entity (invoices, bills, sales orders) + filter + visible columns

All tabs use a shared `<CrudTable />` + `<EntityDialog />` component built on shadcn Dialog + react-hook-form + zod.

## 5. Files

New:
- `supabase/migrations/<ts>_items_settings_and_customization.sql`
- `src/hooks/use-items-settings.ts`
- `src/hooks/use-item-customization.ts` (one hook, switches by table)
- `src/components/settings/items-general-tab.tsx`
- `src/components/settings/items-customization-tab.tsx` (reused per tab)
- `src/components/settings/items-mini-list.tsx`
- `src/components/items/item-form-dialog.tsx`

Edited:
- `src/routes/_authenticated/settings_.items.tsx` (wire tabs to components, replace local state)
- `src/routes/_authenticated/items.tsx` (CRUD polish, settings-driven inputs)

## Technical notes

- Settings load/save via `createServerFn` with `requireSupabaseAuth`; tenant resolved from `current_tenant()`.
- Customization tabs use direct supabase client (browser) since RLS scopes by tenant — simpler than server fns for table-driven UIs.
- Soft delete: archive sets `archived_at`; hard delete only allowed when no transactions reference the item (checked client-side from joins).
- Cross-field zod refinements live in `src/lib/items-settings-schema.ts` to share between hook and UI.

## Out of scope

- Migrating existing hardcoded item fields to custom_fields engine (engine exists; runtime rendering on item forms is additive)
- Per-warehouse stock prevention enforcement at write-time (UI option stored; enforcement is a follow-up)
