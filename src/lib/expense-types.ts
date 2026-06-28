export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const EXPENSE_STATUS_TONE: Record<ExpenseStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  paid: "bg-emerald-600 text-white",
  cancelled: "bg-zinc-200 text-zinc-700",
};

export type ExpenseItemInput = {
  id?: string;
  category_id: string | null;
  account_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  tax_rate: number;
  tax_amount: number;
  customer_id: string | null;
  position: number;
};

export const SEED_CATEGORIES = [
  "Travel",
  "Meals",
  "Accommodation",
  "Fuel",
  "Office Supplies",
  "Marketing",
  "Internet",
  "Utilities",
  "Insurance",
  "Professional Fees",
  "Transport",
];
