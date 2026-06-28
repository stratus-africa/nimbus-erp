import { cn } from "@/lib/utils";
import { EXPENSE_STATUS_LABEL, EXPENSE_STATUS_TONE, type ExpenseStatus } from "@/lib/expense-types";

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        EXPENSE_STATUS_TONE[status] ?? "bg-muted",
      )}
    >
      {EXPENSE_STATUS_LABEL[status] ?? status}
    </span>
  );
}
