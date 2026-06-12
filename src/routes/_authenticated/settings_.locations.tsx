import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, X, Search, Warehouse, Settings as SettingsIcon, Star, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/locations")({
  head: () => ({ meta: [{ title: "Locations — Nimbus ERP" }] }),
  component: LocationsPage,
});

type Location = {
  id: string;
  name: string;
  branch: string | null;
  attention: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  country: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  is_active: boolean;
};

function LocationsPage() {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["locations", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Location[]> => {
      const { data, error } = await supabase
        .from("locations" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) as Location[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((l) =>
      [l.name, l.branch, l.city, l.country, l.email].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [locations, query]);

  const setPrimary = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("locations" as any).update({ is_primary: false }).eq("tenant_id", tenantId!);
      const { error } = await supabase.from("locations" as any).update({ is_primary: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Primary location updated");
      qc.invalidateQueries({ queryKey: ["locations", tenantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("locations" as any).update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location updated");
      qc.invalidateQueries({ queryKey: ["locations", tenantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location deleted");
      qc.invalidateQueries({ queryKey: ["locations", tenantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-muted/30">
      {/* Top bar */}
      <div className="flex items-center gap-4 border-b bg-card px-6 py-3">
        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search locations ( / )"
              className="h-10 pl-9 border-primary/30 focus-visible:border-primary"
            />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2"
          onClick={() => navigate({ to: "/settings" })}>
          Close Settings <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-foreground/70" />
          <h1 className="text-lg font-semibold">Locations</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden md:inline">
            Set up user-level restrictions on locations{" "}
            <button className="text-primary hover:underline">Enable Restrictions</button>
          </span>
          <Button
            className="h-9 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => navigate({ to: "/settings/locations/new" })}
          >
            <Plus className="h-4 w-4" /> New Location
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="p-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
            {query ? `No locations match "${query}"` : "No locations yet. Click \"New Location\" to add one."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((loc) => (
              <div
                key={loc.id}
                className={cn(
                  "relative rounded-lg border bg-card p-4 shadow-sm overflow-hidden",
                  !loc.is_active && "opacity-90",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{loc.name}</div>
                    {loc.is_primary && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-orange-400 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                        <Star className="h-3 w-3 fill-orange-500 text-orange-500" />
                        Organization's Primary
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      className="h-7 px-3 bg-orange-500 hover:bg-orange-600 text-white"
                      onClick={() => navigate({ to: "/settings/locations/$locationId/edit", params: { locationId: loc.id } })}
                    >
                      Edit
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 px-2 gap-1">
                          <SettingsIcon className="h-3 w-3" />
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!loc.is_primary && (
                          <DropdownMenuItem onClick={() => setPrimary.mutate(loc.id)}>
                            Mark as Primary
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => toggleActive.mutate({ id: loc.id, is_active: !loc.is_active })}
                        >
                          Mark as {loc.is_active ? "Inactive" : "Active"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (loc.is_primary) {
                              toast.error("Cannot delete the primary location");
                              return;
                            }
                            if (confirm(`Delete "${loc.name}"?`)) remove.mutate(loc.id);
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-3 space-y-0.5 text-sm text-foreground/80">
                  {loc.street1 && <div>{loc.street1}{loc.street2 ? `, ${loc.street2}` : ""},</div>}
                  {loc.city && <div>{loc.city},</div>}
                  {loc.country && <div>{loc.country},</div>}
                  {loc.email && <div className="text-foreground/70">{loc.email}</div>}
                </div>
                {loc.branch && (
                  <div className="mt-3 text-sm">
                    <span className="font-semibold">Branch:</span> {loc.branch}
                  </div>
                )}

                {!loc.is_active && (
                  <div className="absolute bottom-0 right-0 bg-muted text-muted-foreground text-[10px] font-semibold px-3 py-1 tracking-wider"
                       style={{ clipPath: "polygon(12% 0, 100% 0, 100% 100%, 0 100%)" }}>
                    INACTIVE
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
