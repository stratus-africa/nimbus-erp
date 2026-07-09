import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  LayoutDashboard,
  Users,
  FileText,
  ReceiptText,
  Truck,
  ShoppingCart,
  FileCheck,
  Boxes,
  ClipboardList,
  BookOpen,
  NotebookPen,
  BarChart3,
  Landmark,
  Settings,
  ShieldCheck,
  LogOut,
  Sparkles,
  ChevronRight,
  ShoppingBag,
  Wallet,
  Calculator,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { usePermissions } from "@/hooks/use-permissions";

import { useSidebarPrefs } from "@/hooks/use-sidebar-prefs";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { title: string; url: string; icon: any; module?: string };
type NavGroup = { label: string; icon: any; url?: string; items?: NavItem[]; module?: string };

const NAV_GROUPS: NavGroup[] = [
  { label: "Dashboard", icon: LayoutDashboard, url: "/dashboard" },
  {
    label: "Sales",
    icon: ShoppingBag,
    items: [
      { title: "Customers", url: "/customers", icon: Users, module: "customers" },
      { title: "Quotes", url: "/quotes", icon: FileText, module: "quotes" },
      { title: "Sales Orders", url: "/sales-orders", icon: FileText, module: "sales_orders" },
      { title: "Invoices", url: "/invoices", icon: ReceiptText, module: "invoices" },
      { title: "Payments Received", url: "/payments-received", icon: ReceiptText, module: "invoices" },
      { title: "Credit Notes", url: "/credit-notes", icon: FileText, module: "invoices" },
    ],
  },
  {
    label: "Purchases",
    icon: ShoppingCart,
    items: [
      { title: "Suppliers", url: "/suppliers", icon: Truck, module: "suppliers" },
      { title: "Purchase Orders", url: "/purchase-orders", icon: ShoppingCart, module: "purchase_orders" },
      { title: "Bills", url: "/bills", icon: FileCheck, module: "bills" },
      { title: "Expenses", url: "/expenses", icon: ReceiptText, module: "expenses" },
      { title: "Payments Made", url: "/payments-made", icon: FileCheck, module: "bills" },
      { title: "Supplier Credits", url: "/supplier-credits", icon: FileCheck, module: "bills" },
    ],
  },
  {
    label: "Inventory",
    icon: Boxes,
    items: [
      { title: "Items", url: "/items", icon: Boxes, module: "items" },
      { title: "Production Items", url: "/production-items", icon: Boxes, module: "items" },
      { title: "Production", url: "/assembly-orders", icon: ClipboardList, module: "items" },
      { title: "Adjustments", url: "/inventory-adjustments", icon: ClipboardList, module: "items" },
      { title: "Packages", url: "/packages", icon: Boxes, module: "items" },
      { title: "Deliveries", url: "/deliveries", icon: Truck, module: "items" },
      { title: "Warehouses", url: "/warehouses", icon: Boxes, module: "warehouses" },
      { title: "Transfer Orders", url: "/transfer-orders", icon: ClipboardList, module: "transfer_orders" },
    ],
  },
  { label: "Banking", icon: Wallet, url: "/banking", module: "banking" },
  {
    label: "Accountant",
    icon: Calculator,
    items: [
      { title: "Manual Journals", url: "/journals", icon: NotebookPen, module: "chart_of_accounts" },
      { title: "Tax Payments", url: "/tax-payments", icon: ReceiptText, module: "chart_of_accounts" },
      { title: "Chart of Accounts", url: "/chart-of-accounts", icon: BookOpen, module: "chart_of_accounts" },
      { title: "Fixed Assets", url: "/fixed-assets", icon: Landmark, module: "chart_of_accounts" },
    ],
  },
  { label: "Reports", icon: BarChart3, url: "/reports", module: "reports" },
];


export function AppShell({ children }: { children: ReactNode }) {
  const { data: profile, isLoading } = useProfile();
  const [onboardOpen, setOnboardOpen] = useState(false);
  const userId = profile?.user?.id ?? null;
  const { prefs, setOpen, setGroupOpen } = useSidebarPrefs(userId);

  useEffect(() => {
    if (!isLoading && profile && profile.memberships.length === 0) {
      setOnboardOpen(true);
    }
  }, [isLoading, profile]);

  return (
    <SidebarProvider open={prefs.open} onOpenChange={setOpen}>
      <div className="flex min-h-screen w-full bg-muted/30">
        <AppSidebar groupPrefs={prefs.groups} onGroupToggle={setGroupOpen} />
        <div className="flex flex-1 flex-col">
          <TopBar />
          <main id="main-content" className="flex-1 p-6">{children}</main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
      <TenantOnboardingDialog open={onboardOpen} onOpenChange={setOnboardOpen} />
    </SidebarProvider>
  );
}

function AppSidebar({
  groupPrefs,
  onGroupToggle,
}: {
  groupPrefs: Record<string, boolean>;
  onGroupToggle: (label: string, open: boolean) => void;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const { can, ready } = usePermissions();

  // Filter nav items by module view permission (ready=true unless custom-role query is loading).
  const visibleGroups = ready
    ? NAV_GROUPS.map((g) => {
        if (g.items) {
          const items = g.items.filter((i) => !i.module || can(i.module as any, "view"));
          return items.length ? { ...g, items } : null;
        }
        if (g.module && !can(g.module as any, "view")) return null;
        return g;
      }).filter(Boolean) as NavGroup[]
    : NAV_GROUPS;


  return (
    <Sidebar collapsible="icon" aria-label="Primary">
      <SidebarContent>
        <div className="flex h-14 items-center gap-2 px-4 font-semibold">
          <div
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && <span>Nimbus</span>}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {(() => {
                // Determine the single open group (accordion).
                const explicit = visibleGroups.find(
                  (g) => g.items && groupPrefs[g.label] === true,
                );
                const activeGroup = visibleGroups.find(
                  (g) => g.items && g.items!.some((i) => pathname === i.url || pathname.startsWith(i.url + "/")),
                );
                const openLabel =
                  Object.values(groupPrefs).some((v) => v === true)
                    ? explicit?.label
                    : activeGroup?.label;

                return visibleGroups.map((g) => {
                const Icon = g.icon;
                if (!g.items) {
                  const active = pathname === g.url || (g.url ? pathname.startsWith(g.url + "/") : false);
                  return (
                    <SidebarMenuItem key={g.label}>
                      <SidebarMenuButton asChild isActive={active} tooltip={g.label}>
                        <Link
                          to={g.url!}
                          className="flex items-center gap-2"
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          <span className={collapsed ? "sr-only" : undefined}>{g.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                const groupActive = g.items.some(
                  (i) => pathname === i.url || pathname.startsWith(i.url + "/"),
                );
                const isOpen = openLabel === g.label;
                return (
                  <Collapsible
                    key={g.label}
                    open={isOpen}
                    onOpenChange={(v) => onGroupToggle(g.label, v)}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          tooltip={g.label}
                          isActive={groupActive}
                          aria-label={`${g.label} menu`}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {!collapsed && (
                            <>
                              <span>{g.label}</span>
                              <ChevronRight
                                className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90"
                                aria-hidden="true"
                              />
                            </>
                          )}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      {!collapsed && (
                        <CollapsibleContent>
                          <SidebarMenuSub aria-label={`${g.label} submenu`}>
                            {g.items.map((item) => {
                              const active = pathname === item.url || pathname.startsWith(item.url + "/");
                              return (
                                <SidebarMenuSubItem key={item.url}>
                                  <SidebarMenuSubButton asChild isActive={active}>
                                    <Link to={item.url} aria-current={active ? "page" : undefined}>
                                      <span>{item.title}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </SidebarMenuItem>
                  </Collapsible>
                );
              });
              })()}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>


        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")} tooltip="Settings">
                  <Link
                    to="/settings"
                    className="flex items-center gap-2"
                    aria-current={pathname.startsWith("/settings") ? "page" : undefined}
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    <span className={collapsed ? "sr-only" : undefined}>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {profile?.isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")} tooltip="Super Admin">
                    <Link
                      to="/admin"
                      className="flex items-center gap-2"
                      aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      <span className={collapsed ? "sr-only" : undefined}>Super Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const switchTenant = async (tenantId: string) => {
    const { error } = await supabase.rpc("switch_tenant", { _tenant: tenantId });
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
    toast.success("Workspace switched");
  };

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background px-4">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-1.5 focus:text-sm focus:shadow focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <SidebarTrigger aria-label="Toggle navigation sidebar" />
      <div className="flex-1" />
      {profile && profile.memberships.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <span className="hidden sm:inline">{profile.currentTenant?.name ?? "Workspace"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {profile.memberships.map((m: any) => (
              <DropdownMenuItem key={m.tenant_id} onClick={() => switchTenant(m.tenant_id)}>
                {m.tenants.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
              {(profile?.profile?.full_name ?? profile?.user.email ?? "?")
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <span className="hidden sm:inline">{profile?.profile?.full_name ?? profile?.user.email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{profile?.user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>Settings</DropdownMenuItem>
          <DropdownMenuItem onClick={signOut} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function TenantOnboardingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  const onCreate = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("provision_tenant", {
      _name: name,
      _slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      _currency: currency,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Workspace created!");
    onOpenChange(false);
    qc.invalidateQueries();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Create your workspace</DialogTitle>
          <DialogDescription>
            Let's set up your organization. You can invite teammates later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Company name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
          </div>
          <div className="space-y-2">
            <Label>URL slug (optional)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme" />
          </div>
          <div className="space-y-2">
            <Label>Base currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["USD", "EUR", "GBP", "INR", "AUD", "CAD", "AED", "SAR", "NGN", "KES", "ZAR"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!name || saving} onClick={onCreate}>
            {saving ? "Creating…" : "Create workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
