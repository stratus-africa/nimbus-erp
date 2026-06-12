import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/profile")({
  head: () => ({ meta: [{ title: "Organization Profile — Settings" }] }),
  component: ProfilePage,
});

/** Fiscal year options: month -> label (e.g. 7 -> "July - June"). */
const FY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "January - December" },
  { value: 2, label: "February - January" },
  { value: 3, label: "March - February" },
  { value: 4, label: "April - March" },
  { value: 5, label: "May - April" },
  { value: 6, label: "June - May" },
  { value: 7, label: "July - June" },
  { value: 8, label: "August - July" },
  { value: 9, label: "September - August" },
  { value: 10, label: "October - September" },
  { value: 11, label: "November - October" },
  { value: 12, label: "December - November" },
];

/** Compute the current fiscal year window from a start month (1-12). */
export function currentFiscalYearRange(fyStartMonth: number, today: Date = new Date()) {
  const startMonthIdx = Math.max(1, Math.min(12, fyStartMonth || 1)) - 1;
  const fyStartYear =
    today.getMonth() >= startMonthIdx ? today.getFullYear() : today.getFullYear() - 1;
  const start = new Date(fyStartYear, startMonthIdx, 1);
  const end = new Date(fyStartYear + 1, startMonthIdx, 0); // last day prev month next year
  const label =
    start.getFullYear() === end.getFullYear()
      ? `FY ${start.getFullYear()}`
      : `FY ${start.getFullYear()}–${String(end.getFullYear()).slice(-2)}`;
  return { start, end, label };
}

function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const tenant = profile?.currentTenant as any;
  const initialFy: number = tenant?.fiscal_year_start ?? 1;
  const [fyStart, setFyStart] = useState<number>(initialFy);

  useEffect(() => { setFyStart(initialFy); }, [initialFy]);

  const range = useMemo(() => currentFiscalYearRange(fyStart), [fyStart]);

  const save = useMutation({
    mutationFn: async (next: number) => {
      if (!tenant?.id) throw new Error("No tenant");
      const { error } = await supabase
        .from("tenants")
        .update({ fiscal_year_start: next })
        .eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Fiscal year updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update fiscal year"),
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="inline h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const dirty = fyStart !== initialFy;

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-muted/30">
      <div className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">Organization Profile</h1>
          <p className="text-xs text-muted-foreground">{tenant?.name ?? "—"}</p>
        </div>
        <Link to="/settings" className="text-sm text-primary hover:underline">
          ← All Settings
        </Link>
      </div>

      <div className="p-6 max-w-3xl space-y-6">
        <section className="rounded-lg border bg-card p-6 space-y-5">
          <header>
            <h2 className="text-sm font-semibold">Fiscal Year</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Used across dashboards and reports to define your financial year window.
            </p>
          </header>

          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm">Fiscal Year</Label>
            <div className="space-y-2">
              <Select
                value={String(fyStart)}
                onValueChange={(v) => setFyStart(Number(v))}
              >
                <SelectTrigger className="h-9 w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="inline-flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5" />
                <span>
                  Current window: <span className="font-medium text-foreground">{range.label}</span>{" "}
                  ({range.start.toLocaleDateString()} — {range.end.toLocaleDateString()})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              onClick={() => save.mutate(fyStart)}
              disabled={!dirty || save.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setFyStart(initialFy)}
              disabled={!dirty || save.isPending}
            >
              Cancel
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
