// Shared formatting helpers
export function formatCurrency(amount: number | string | null | undefined, currency = "USD") {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n || 0);
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info/10 text-info border-info/20",
  accepted: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  converted: "bg-primary/10 text-primary border-primary/20",
  partially_paid: "bg-warning/10 text-warning-foreground border-warning/20",
  paid: "bg-success/10 text-success border-success/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground",
  approved: "bg-info/10 text-info border-info/20",
  partially_received: "bg-warning/10 text-warning-foreground border-warning/20",
  received: "bg-success/10 text-success border-success/20",
  closed: "bg-muted text-muted-foreground",
  open: "bg-info/10 text-info border-info/20",
  active: "bg-success/10 text-success border-success/20",
  trial: "bg-info/10 text-info border-info/20",
  suspended: "bg-destructive/10 text-destructive border-destructive/20",
};

export function statusLabel(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
