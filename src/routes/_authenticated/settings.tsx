import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useProfile } from "@/hooks/use-profile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  X,
  Building2,
  Users,
  Settings as SettingsIcon,
  Palette,
  Receipt,
  Boxes,
  ShoppingCart,
  ShoppingBag,
  LayoutGrid,
  CreditCard,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Nimbus ERP" }] }),
  component: SettingsPage,
});

type Item = { label: string; to?: string; badge?: string };
type Group = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "rose" | "amber" | "violet" | "sky" | "indigo";
  items: Item[];
};
type Section = { title: string; columns: Group[][] };

const SECTIONS: Section[] = [
  {
    title: "Organization Settings",
    columns: [
      [
        {
          title: "Organization",
          icon: Building2,
          tone: "emerald",
          items: [
            { label: "Profile" },
            { label: "Branding" },
            { label: "Custom Domain" },
            { label: "Locations" },
            { label: "Manage Subscription" },
          ],
        },
      ],
      [
        {
          title: "Users & Roles",
          icon: Users,
          tone: "rose",
          items: [{ label: "Users", to: "/admin" }, { label: "Roles" }, { label: "User Preferences" }],
        },
      ],
      [
        {
          title: "Setup & Configurations",
          icon: SettingsIcon,
          tone: "amber",
          items: [
            { label: "General" },
            { label: "Currencies" },
            { label: "Payment Terms", badge: "NEW" },
            { label: "Opening Balances" },
            { label: "Reminders" },
            { label: "Customer Portal" },
            { label: "Vendor Portal" },
          ],
        },
      ],
      [
        {
          title: "Customization",
          icon: Palette,
          tone: "violet",
          items: [
            { label: "Transaction Number Series" },
            { label: "PDF Templates" },
            { label: "Email Notifications" },
            { label: "Reporting Tags" },
          ],
        },
      ],
      [
        {
          title: "Taxes & Compliance",
          icon: Receipt,
          tone: "sky",
          items: [{ label: "VAT" }, { label: "Withholding Tax" }, { label: "e-Invoicing" }],
        },
      ],
    ],
  },
  {
    title: "Module Settings",
    columns: [
      [
        {
          title: "General",
          icon: LayoutGrid,
          tone: "emerald",
          items: [
            { label: "Customers and Vendors", to: "/customers" },
            { label: "Items", to: "/items" },
            { label: "Accountant" },
            { label: "Tasks" },
          ],
        },
      ],
      [
        {
          title: "Inventory",
          icon: Boxes,
          tone: "rose",
          items: [{ label: "Inventory Adjustments", to: "/inventory-adjustments" }],
        },
      ],
      [
        {
          title: "Sales",
          icon: ShoppingCart,
          tone: "sky",
          items: [
            { label: "Quotes", to: "/settings/quotes" },
            { label: "Invoices", to: "/invoices" },
            { label: "Recurring Invoices" },
            { label: "Sales Receipts" },
            { label: "Payments Received" },
            { label: "Credit Notes" },
            { label: "Delivery Notes" },
          ],
        },
      ],
      [
        {
          title: "Purchases",
          icon: ShoppingBag,
          tone: "amber",
          items: [
            { label: "Expenses" },
            { label: "Bills", to: "/bills" },
            { label: "Payments Made" },
            { label: "Vendor Credits" },
          ],
        },
      ],
      [
        {
          title: "Online Payments",
          icon: CreditCard,
          tone: "amber",
          items: [{ label: "Payment Gateways" }],
        },
      ],
    ],
  },
];

const TONE: Record<Group["tone"], { bg: string; fg: string }> = {
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", fg: "text-emerald-600 dark:text-emerald-400" },
  rose: { bg: "bg-rose-50 dark:bg-rose-950/40", fg: "text-rose-600 dark:text-rose-400" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/40", fg: "text-amber-600 dark:text-amber-400" },
  violet: { bg: "bg-violet-50 dark:bg-violet-950/40", fg: "text-violet-600 dark:text-violet-400" },
  sky: { bg: "bg-sky-50 dark:bg-sky-950/40", fg: "text-sky-600 dark:text-sky-400" },
  indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/40", fg: "text-indigo-600 dark:text-indigo-400" },
};

function SettingsPage() {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      columns: s.columns
        .map((col) =>
          col
            .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
            .filter((g) => g.items.length),
        )
        .filter((col) => col.length),
    })).filter((s) => s.columns.length);
  }, [query]);

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-muted/30">
      {/* Top bar */}
      <div className="flex items-center gap-4 border-b bg-card px-6 py-3">
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold leading-tight">All Settings</div>
            <div className="text-xs text-muted-foreground">{profile?.currentTenant?.name ?? "—"}</div>
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings ( / )"
              className="h-10 pl-9 border-primary/30 focus-visible:border-primary"
            />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => navigate({ to: "/dashboard" })}>
          Close Settings <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-5 p-6">
        {sections.map((s) => (
          <section key={s.title} className="rounded-lg border bg-card shadow-sm">
            <header className="px-6 pt-5 pb-3">
              <h2 className="text-base font-semibold">{s.title}</h2>
            </header>
            <div className="grid gap-px bg-border/60 sm:grid-cols-2 lg:grid-cols-5 border-t">
              {s.columns.map((col, i) => (
                <div key={i} className="flex flex-col gap-3 bg-card p-4">
                  {col.map((g) => (
                    <GroupCard key={g.title} group={g} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
        {!sections.length && (
          <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
            No settings match "{query}".
          </div>
        )}
      </div>
    </div>
  );
}

function GroupCard({ group }: { group: Group }) {
  const tone = TONE[group.tone];
  const Icon = group.icon;
  return (
    <div>
      <div className={cn("flex items-center gap-2 rounded-md px-3 py-2", tone.bg)}>
        <Icon className={cn("h-4 w-4", tone.fg)} />
        <span className="text-sm font-semibold">{group.title}</span>
      </div>
      <ul className="mt-2 space-y-1.5 px-3 pb-1">
        {group.items.map((item) => (
          <li key={item.label}>
            <SettingsLink item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsLink({ item }: { item: Item }) {
  const content = (
    <span className="flex items-center gap-2 text-sm text-foreground/80 hover:text-primary transition-colors">
      {item.label}
      {item.badge && (
        <span className="rounded-sm bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {item.badge}
        </span>
      )}
    </span>
  );
  if (item.to) {
    return (
      <Link to={item.to as any} className="block py-0.5">
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className="block py-0.5 text-left w-full">
      {content}
    </button>
  );
}
