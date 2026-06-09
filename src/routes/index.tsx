import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, Boxes, FileText, ShieldCheck, Sparkles, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nimbus ERP — Modern accounting & operations for growing teams" },
      {
        name: "description",
        content:
          "A modern multi-tenant ERP for SMEs: invoicing, purchases, inventory, accounting, and reporting in one place.",
      },
      { property: "og:title", content: "Nimbus ERP" },
      {
        property: "og:description",
        content: "Modern multi-tenant ERP — invoicing, purchases, inventory, accounting.",
      },
    ],
  }),
  component: Landing,
});

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm transition hover:shadow-md">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            Nimbus ERP
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Multi-tenant • Secure • Built for SMEs
          </div>
          <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight md:text-6xl">
            The modern ERP your business
            <span className="block bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
              actually enjoys using.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            Invoicing, purchases, inventory, and accounting — unified in a clean,
            fast workspace. Designed for growing teams that have outgrown spreadsheets.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Start free trial <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline">
                Explore features
              </Button>
            </a>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Feature icon={FileText} title="Sales & Invoicing" desc="Quotes, invoices, payments, and customer accounts with status workflows." />
            <Feature icon={Wallet} title="Purchases & Bills" desc="Suppliers, purchase orders, and bill payments with full tracking." />
            <Feature icon={Boxes} title="Inventory" desc="Item master, stock adjustments, and real-time on-hand quantities." />
            <Feature icon={BarChart3} title="Accounting & Reports" desc="Double-entry CoA, manual journals, P&L, and trial balance." />
            <Feature icon={ShieldCheck} title="Multi-tenant & Secure" desc="Tenant-isolated data with row-level security and role-based access." />
            <Feature icon={Sparkles} title="Modern UI" desc="Built with React, TanStack, and a delightful, fast workspace." />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Nimbus ERP</span>
          <Link to="/auth" className="hover:text-foreground">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
