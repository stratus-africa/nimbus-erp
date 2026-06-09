import { createFileRoute } from "@tanstack/react-router";
import { TransactionsModule } from "@/components/transactions-module";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  head: () => ({ meta: [{ title: "Purchase Orders — Nimbus ERP" }] }),
  component: () => (
    <TransactionsModule config={{
      kind: "purchase_order",
      title: "Purchase Orders",
      description: "Orders sent to your suppliers.",
      docTable: "purchase_orders",
      linesTable: "purchase_order_lines",
      numberField: "po_number",
      dateField: "po_date",
      secondaryDateField: "expected_date",
      secondaryDateLabel: "Expected date",
      partyField: "supplier_id",
      partyTable: "suppliers",
      partyLabel: "Supplier",
      docTypeForNumbering: "purchase_order",
      fkLinesField: "po_id",
      statuses: [
        { value: "draft", label: "Draft" },
        { value: "approved", label: "Approved" },
        { value: "sent", label: "Sent" },
        { value: "partially_received", label: "Partially received" },
        { value: "received", label: "Received" },
        { value: "closed", label: "Closed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    }} />
  ),
});
