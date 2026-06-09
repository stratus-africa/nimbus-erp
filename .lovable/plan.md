# Multi-Tenant SaaS ERP — v1 Plan

A full Zoho Books clone is months of work. This v1 ships a **production-shaped foundation** with the core happy-paths working end-to-end, and scaffolds everything else so we can fill it in over follow-ups.

## What ships fully working in v1

**Platform**
- Lovable Cloud (Postgres + Auth + Storage)
- Email/password auth + self-serve signup → creates a new tenant (organization), signup user becomes Company Admin
- Super Admin role with separate `/admin` console: list tenants, suspend/activate, manage plans
- Multi-tenant data isolation via `tenant_id` on every table + RLS using a `current_tenant()` security-definer function
- Role-based permissions (Super Admin, Company Admin, Accountant, Sales, Purchasing, Inventory, Read-Only) stored in `user_roles`
- App shell: collapsible left sidebar, sticky top nav, global search stub, tenant/company selector, profile menu, quick-create

**Sales (core flow working)**
- Customers: full CRUD, list with search/filter/pagination, detail page, statement view
- Invoices: CRUD, line items, auto tax calc, status workflow (Draft → Sent → Partially Paid → Paid → Overdue), record payments, PDF view
- Quotes: CRUD, status workflow, convert to Invoice

**Purchases (core flow working)**
- Suppliers: full CRUD
- Purchase Orders: CRUD, status workflow, convert to Bill
- Bills: CRUD, record payments

**Inventory (core flow working)**
- Items master: SKU, type (inventory/service), pricing, stock on hand, reorder level
- Inventory Adjustments: increase/decrease/recount with reason and variance tracking
- Stock automatically updates on invoice/bill posting

**Accounting (core flow working)**
- Chart of Accounts: hierarchical, seeded with standard accounts per new tenant
- Manual Journals: double-entry with balance validation
- Auto-posting: invoices/bills/payments generate journal entries

**Dashboard**
- KPI cards (Sales, Purchases, Receivables, Payables, Inventory Value, Cash)
- Revenue trend chart (Recharts)
- Recent transactions, top customers, inventory alerts

**Reports (read-only v1)**
- Trial Balance, Profit & Loss, Customer Aging, Inventory Valuation
- Date filters, CSV export

**Settings**
- Company profile, fiscal year, base currency, tax rates
- User management (invite by email, assign roles)
- Numbering series per document type

## What's scaffolded but marked "Coming soon" in v1

To keep this turn shippable, these get sidebar entries + placeholder pages with empty states. Each is a follow-up turn:

- Credit Notes, Sales Orders → Packages → Shipments pipeline
- Purchase Receives (GRN), Supplier Credits
- Banking + Reconciliation screen
- Recurring invoices/journals, approval workflows
- Customer Portal
- Excel export, advanced report filters, audit logs UI
- Batch/serial tracking, multi-warehouse

## Database overview

~25 tables. All transactional tables share: `id`, `tenant_id`, `created_by`, `created_at`, `updated_at`, `deleted_at` (soft delete).

```text
tenants, subscription_plans, tenant_subscriptions
profiles, user_roles (with app_role enum + has_role security-definer)
tenant_members (links users to tenants)
customers, suppliers
items, inventory_adjustments, inventory_adjustment_lines
quotes, quote_lines
invoices, invoice_lines, invoice_payments
purchase_orders, purchase_order_lines
bills, bill_lines, bill_payments
chart_of_accounts, journal_entries, journal_lines
tax_rates, numbering_series, company_settings
```

RLS pattern: every policy filters by `tenant_id = current_tenant()` AND role check via `has_role()`. Super Admin role bypasses tenant filter for the `/admin` console only.

## Tech specifics

- TanStack Start (already scaffolded), TanStack Query for data, React Hook Form + Zod for forms
- Server functions for all writes (auth-protected via `requireSupabaseAuth`); reads through Supabase client with RLS
- Shadcn components customized via design tokens in `src/styles.css` — Modern SaaS palette (indigo primary, emerald success, slate neutrals, generous whitespace, refined typography)
- Recharts for analytics, Sonner for toasts, Lucide icons

## Build order this turn

1. Enable Lovable Cloud
2. Migration: all tables + RLS + seed data (CoA template, default plans, super-admin role bootstrap)
3. Auth flow + tenant provisioning trigger
4. App shell (sidebar, topnav, layout)
5. Dashboard
6. Customers + Invoices + Quotes (sales core)
7. Suppliers + POs + Bills (purchases core)
8. Items + Adjustments
9. CoA + Manual Journals + auto-posting
10. Reports
11. Settings + user management
12. Super Admin console
13. Placeholder pages for "coming soon" modules

Realistically this is a very large turn. I'll work efficiently in parallel, but expect a follow-up message or two to polish edge cases (PDF rendering, advanced filters, etc.) once you see it running.

Approve and I'll start with enabling Cloud and writing the migration.
