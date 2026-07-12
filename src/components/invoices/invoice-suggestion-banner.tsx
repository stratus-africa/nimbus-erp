import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { Lightbulb, X } from "lucide-react";

export type SuggestionLine = {
  item_id: string | null;
  description: string | null;
  quantity: number;
  rate: number;
  tax_rate: number;
  position: number;
  line_total: number;
};

/**
 * When a customer is selected on a new invoice, look for open Sales Orders
 * or Quotes and offer to prefill the invoice with their line items.
 */
export function InvoiceSuggestionBanner({
  tenantId,
  customerId,
  onImport,
}: {
  tenantId: string;
  customerId: string;
  onImport: (lines: SuggestionLine[], sourceLabel: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  const { data: docs } = useQuery({
    enabled: !!tenantId && !!customerId,
    queryKey: ["invoice-suggestions", tenantId, customerId],
    queryFn: async () => {
      const [soRes, qRes] = await Promise.all([
        (supabase as any)
          .from("sales_orders")
          .select("id, so_number, so_date, total, status")
          .eq("tenant_id", tenantId)
          .eq("customer_id", customerId)
          .in("status", ["confirmed", "sent", "partially_invoiced"])
          .order("so_date", { ascending: false })
          .limit(20),
        (supabase as any)
          .from("quotes")
          .select("id, quote_number, quote_date, total, status")
          .eq("tenant_id", tenantId)
          .eq("customer_id", customerId)
          .in("status", ["accepted", "sent"])
          .order("quote_date", { ascending: false })
          .limit(20),
      ]);
      const sos = (soRes.data ?? []).map((r: any) => ({
        kind: "sales_order" as const,
        id: r.id,
        number: r.so_number,
        date: r.so_date,
        total: r.total,
        status: r.status,
      }));
      const qs = (qRes.data ?? []).map((r: any) => ({
        kind: "quote" as const,
        id: r.id,
        number: r.quote_number,
        date: r.quote_date,
        total: r.total,
        status: r.status,
      }));
      return [...sos, ...qs];
    },
  });

  if (dismissed || !docs || docs.length === 0) return null;

  const importFrom = async (d: (typeof docs)[number]) => {
    const table = d.kind === "sales_order" ? "sales_order_lines" : "quote_lines";
    const fk = d.kind === "sales_order" ? "sales_order_id" : "quote_id";
    const { data, error } = await (supabase as any)
      .from(table)
      .select("item_id, description, quantity, rate, tax_rate, position, line_total")
      .eq(fk, d.id)
      .order("position");
    if (error) return;
    const lines = (data ?? []).map((l: any, i: number) => ({
      item_id: l.item_id ?? null,
      description: l.description ?? "",
      quantity: Number(l.quantity ?? 1),
      rate: Number(l.rate ?? 0),
      tax_rate: Number(l.tax_rate ?? 0),
      position: i,
      line_total: Number(l.line_total ?? Number(l.quantity ?? 1) * Number(l.rate ?? 0)),
    }));
    const label = `${d.kind === "sales_order" ? "SO" : "Quote"} ${d.number}`;
    onImport(lines, label);
    setOpen(false);
    setDismissed(true);
  };

  return (
    <>
      <div className="mt-3 flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <div className="font-medium">
            This customer has {docs.length} open{" "}
            {docs.length === 1 ? "document" : "documents"} you can invoice.
          </div>
          <div className="text-sky-700/80">
            Import line items from an existing sales order or accepted quote.
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-sky-300 bg-white text-sky-800"
          onClick={() => setOpen(true)}
        >
          Review & import
        </Button>
        <button
          className="rounded p-0.5 text-sky-700 hover:bg-sky-100"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import lines into invoice</DialogTitle>
            <DialogDescription>
              Choose an open sales order or accepted quote to prefill this
              invoice. Existing lines will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[340px] space-y-1 overflow-auto">
            {docs.map((d) => (
              <button
                key={`${d.kind}-${d.id}`}
                onClick={() => importFrom(d)}
                className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                <div>
                  <div className="font-medium">
                    {d.kind === "sales_order" ? "Sales Order" : "Quote"}{" "}
                    <span className="text-sky-600">{d.number}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(d.date)} · {d.status?.replace("_", " ")}
                  </div>
                </div>
                <div className="tabular-nums">{Number(d.total ?? 0).toFixed(2)}</div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
