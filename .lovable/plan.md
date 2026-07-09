# Sales Orders → Packages → Shipments + Warehouse Access

## 1. Database (single migration)

**New tables**
- `package_items` — one row per SO line copied into the package (`package_id`, `item_id`, `description`, `quantity`, `sales_order_line_id`).
- `shipment_packages` — join table so a shipment can carry many packages (`shipment_id`, `package_id`, unique pair). Keep the existing `shipments.package_id` for backward-compat but treat it as "primary package"; new UI reads via the join table.
- `user_warehouses` — `(tenant_id, user_id, warehouse_id)` unique. RLS: company_admin manages, users read own rows.

**New functions**
- `create_package_from_sales_order(_so_id uuid) returns uuid` — SECURITY DEFINER. Validates tenant + `has_permission('sales_orders','edit')`. Copies every SO line at ordered qty into `package_items`. Uses `next_doc_number(_,'package')`. Updates SO status → `packed` (add enum value if missing; else store on new `packed_at` timestamp and leave status alone). Audit-logs `package_created_from_so`.
- `create_shipment_from_package(_package_id uuid, _carrier text, _tracking text, _tracking_url text) returns uuid` — creates a shipment, links via `shipment_packages`, sets `packages.status='shipped'`.
- `attach_packages_to_shipment(_shipment_id uuid, _package_ids uuid[])` — bulk-attach many packages; validates same tenant + same source_warehouse; blocks packages already on another shipment.
- `user_can_see_warehouse(_user uuid, _tenant uuid, _warehouse uuid) returns boolean` — true if super_admin, company_admin, or row exists in `user_warehouses`, or user has NO restrictions (i.e. no `user_warehouses` rows for that tenant = unrestricted).
- `visible_warehouse_ids(_tenant uuid) returns setof uuid` — helper used by client queries.

## 2. Sales Order changes

- `sales-orders_.$soId.tsx`: rename "Mark as Sent" action → **"Create Package"**. Click calls `create_package_from_sales_order`, toast with link to the new package.
- No behaviour change to any other action.

## 3. Packages module

- Ensure listing page exists at `/packages` (create if missing) showing all packages with SO/customer, status.
- Detail page `/packages/$id`: shows lines from `package_items`, plus a **"Create Shipment"** button → dialog (carrier, tracking#, url) → calls `create_shipment_from_package`, redirects to the new shipment.

## 4. Shipments module

- Listing at `/shipments` (create if missing).
- Detail page `/shipments/$id`: shows attached packages (join query on `shipment_packages`), plus **"Attach Packages"** dialog (multi-select of unassigned packages in same warehouse) → calls `attach_packages_to_shipment`.

## 5. User ↔ Warehouse restriction

- `/settings/users` → row action **"Manage Warehouses"** opens a dialog with checkbox list of tenant warehouses, saves to `user_warehouses`. Empty selection = full access (default).
- New hook `useVisibleWarehouses()` returns the warehouse IDs the current user may see.
- **Item pickers** in Quotes / Sales Orders / Invoices: filter `items` by `warehouse_stock.warehouse_id IN (visible)`. Non-inventory items always visible.
- `/warehouses` listing filters by visible IDs too.
- Company admins & super admins bypass.

## Technical notes

- Reuses existing `packages`, `shipments`, `package_items` (new), `shipment_packages` (new) schema — no rewiring of transfer orders (their `_reserve_transfer_stock` flow is untouched).
- All new tables get GRANTs (authenticated + service_role) and RLS scoped by `is_tenant_member`.
- Item-visibility filtering happens client-side via the visible-warehouses hook AND is enforced by an RLS SELECT policy update on `items` (`OR NOT EXISTS(...user_warehouses...)`).
- If any of the RPCs already exists with a conflicting signature I'll `CREATE OR REPLACE`.

## Order of execution

1. Migration (schema + RPCs + RLS).
2. SO rename action → Create Package.
3. Package detail Create Shipment.
4. Shipment attach multiple packages.
5. User warehouses UI + item picker filtering.

Confirm and I'll ship it in that order.
