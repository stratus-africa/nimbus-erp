import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import {
  ChevronDown,
  GripVertical,
  ImageIcon,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
  CheckCircle2,
  CalendarIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/quotes_/new")({
  head: () => ({ meta: [{ title: "New Quote — Nimbus ERP" }] }),
  component: () => <QuoteFormPage />,
});

type Line = {
  item_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  tax_rate: number;
};

const DEFAULT_NOTES =
  "Quoted Rates are VAT Exclusive Unless Stated\nLooking forward for your business.";
const DEFAULT_TERMS =
  "1. License Fees: License fees must be paid in full either upfront or upon the expiration of the trial period, whichever occurs first.\n2. Consultancy Fees: A down payment of 30% of the consultancy fees is required before the commencement of the project.";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function QuoteFormPage({
  editId,
  initial,
}: { editId?: string; initial?: any } = {}) {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const currency = profile?.currentTenant?.base_currency ?? "KES";
  const qc = useQueryClient();
  const isEdit = !!editId;

  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [location, setLocation] = useState("Head Office");
  const [quoteNumber, setQuoteNumber] = useState(initial?.quote_number ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [quoteDate, setQuoteDate] = useState(initial?.quote_date ?? todayIso());
  const [expiryDate, setExpiryDate] = useState(initial?.expiry_date ?? "");
  const [salesperson, setSalesperson] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? DEFAULT_NOTES);
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [lines, setLines] = useState<Line[]>(
    initial?.lines?.length
      ? initial.lines
      : [{ item_id: null, description: "", quantity: 1, rate: 0, tax_rate: 0 }],
  );

  const { data: customers } = useQuery({
    enabled: !!tenantId,
    queryKey: ["customers-pick", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const { data: items } = useQuery({
    enabled: !!tenantId,
    queryKey: ["items-pick", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("id, name, selling_price")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const { data: taxRates } = useQuery({
    enabled: !!tenantId,
    queryKey: ["tax-rates", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tax_rates")
        .select("id, name, rate")
        .eq("tenant_id", tenantId!)
        .order("rate");
      return data ?? [];
    },
  });

  // Preview the next quote number (display-only; real number is fetched on save)
  const { data: previewNumber } = useQuery({
    enabled: !!tenantId && !isEdit,
    queryKey: ["preview-quote-number", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("quote_number")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = data?.[0]?.quote_number ?? "QT-202400";
      const match = /^(\D*)(\d+)$/.exec(last);
      if (!match) return "QT-202486";
      const next = String(Number(match[2]) + 1).padStart(match[2].length, "0");
      return `${match[1]}${next}`;
    },
  });

  useEffect(() => {
    if (previewNumber && !quoteNumber) setQuoteNumber(previewNumber);
  }, [previewNumber, quoteNumber]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0), 0),
    [lines],
  );
  const taxTotal = useMemo(
    () =>
      lines.reduce(
        (s, l) =>
          s + Number(l.quantity || 0) * Number(l.rate || 0) * (Number(l.tax_rate || 0) / 100),
        0,
      ),
    [lines],
  );
  const total = subtotal + taxTotal;

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines((ls) => [
      ...ls,
      { item_id: null, description: "", quantity: 1, rate: 0, tax_rate: 0 },
    ]);
  const removeLine = (idx: number) =>
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, i) => i !== idx)));

  const pickItem = (idx: number, itemId: string) => {
    const it = items?.find((x: any) => x.id === itemId);
    if (!it) return;
    updateLine(idx, {
      item_id: it.id,
      description: it.name,
      rate: Number(it.selling_price ?? 0),
    });
  };

  const save = useMutation({
    mutationFn: async (sendAfter: boolean) => {
      if (!tenantId) throw new Error("No tenant");
      if (!customerId) throw new Error("Please select a customer");
      if (lines.length === 0) throw new Error("Add at least one line");

      let quoteId: string;
      const basePayload: any = {
        tenant_id: tenantId,
        customer_id: customerId,
        quote_date: quoteDate,
        expiry_date: expiryDate || null,
        status: sendAfter ? "sent" : "draft",
        subtotal,
        tax_total: taxTotal,
        total,
        notes: [description, notes, terms].filter(Boolean).join("\n\n"),
      };

      if (isEdit && editId) {
        const { error: ue } = await supabase
          .from("quotes")
          .update({ ...basePayload, quote_number: quoteNumber })
          .eq("id", editId);
        if (ue) throw ue;
        await supabase.from("quote_lines").delete().eq("quote_id", editId);
        quoteId = editId;
      } else {
        const { data: num, error: ne } = await supabase.rpc("next_doc_number", {
          _tenant: tenantId,
          _doc_type: "quote",
        });
        if (ne) throw ne;
        const { data: inserted, error } = await supabase
          .from("quotes")
          .insert({ ...basePayload, quote_number: num ?? quoteNumber })
          .select("id")
          .single();
        if (error) throw error;
        quoteId = inserted.id;
      }

      const lineRows = lines.map((l, i) => ({
        quote_id: quoteId,
        item_id: l.item_id,
        description: l.description || null,
        quantity: l.quantity,
        rate: l.rate,
        tax_rate: l.tax_rate,
        line_total: Number(l.quantity || 0) * Number(l.rate || 0),
        position: i,
      }));
      const { error: le } = await supabase.from("quote_lines").insert(lineRows);
      if (le) throw le;
      return quoteId;
    },
    onSuccess: (id) => {
      toast.success(isEdit ? "Quote updated" : "Quote saved");
      qc.invalidateQueries({ queryKey: ["quotes-list"] });
      qc.invalidateQueries({ queryKey: ["quote", id] });
      navigate(isEdit ? { to: "/quotes/$quoteId", params: { quoteId: id } } : { to: "/quotes" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Top utility bar */}
      <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-2.5">
        <button className="text-muted-foreground hover:text-foreground" aria-label="Refresh">
          <RefreshCcw className="h-4 w-4" />
        </button>
        <div className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-md border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search in Quotes (  /  )"
          />
        </div>
      </div>

      {/* Title bar */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-3.5">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded border text-muted-foreground">
            <span className="text-[10px]">QT</span>
          </div>
          <h1 className="text-lg font-semibold">New Quote</h1>
        </div>
        <Link to="/quotes" className="text-rose-500 hover:text-rose-600" aria-label="Close">
          <X className="h-5 w-5" />
        </Link>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl space-y-0 px-6 py-6">
          {/* Customer + Location */}
          <section className="space-y-4 border-b pb-6">
            <Field label="Customer Name" required>
              <div className="flex items-center gap-0">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-9 rounded-r-none border-r-0 focus:ring-1 focus:ring-sky-400">
                    <SelectValue placeholder="Select or add a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button className="grid h-9 w-9 place-items-center rounded-r-md bg-emerald-600 text-white hover:bg-emerald-700">
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <Field label="Location">
              <div>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger className="h-9 max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Head Office">Head Office</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Source of Supply: Nairobi</p>
              </div>
            </Field>
          </section>

          {/* Quote meta */}
          <section className="space-y-4 border-b py-6">
            <Field label="Quote#" required>
              <div className="relative max-w-xs">
                <Input
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                  className="h-9 pr-9"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-sky-500 hover:text-sky-600"
                  aria-label="Number settings"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <Field label="Reference#">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="h-9 max-w-xs"
              />
            </Field>
            <Field label="Quote Date" required>
              <div className="flex flex-wrap items-center gap-6">
                <div className="relative">
                  <Input
                    type="date"
                    value={quoteDate}
                    onChange={(e) => setQuoteDate(e.target.value)}
                    className="h-9 w-56 pr-9"
                  />
                  <CalendarIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm">Expiry Date</label>
                  <div className="relative">
                    <Input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      placeholder="dd/MM/yyyy"
                      className="h-9 w-56 pr-9"
                    />
                    <CalendarIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </Field>
          </section>

          {/* Salesperson */}
          <section className="border-b py-6">
            <Field label="Salesperson">
              <Select value={salesperson} onValueChange={setSalesperson}>
                <SelectTrigger className="h-9 max-w-xs">
                  <SelectValue placeholder="Select or Add Salesperson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Me</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </section>

          {/* Description */}
          <section className="border-b py-6">
            <Field label="Description" hint>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Let your customer know what this Quote is for"
                className="min-h-[60px] max-w-md resize-y"
              />
            </Field>
          </section>

          {/* Item table */}
          <section className="py-6">
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold">Item Table</h2>
                <button className="flex items-center gap-1.5 text-xs font-medium text-sky-600 hover:text-sky-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Bulk Actions
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Item Details</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Quantity</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1">
                        Rate <Settings2 className="h-3 w-3" />
                      </span>
                    </th>
                    <th className="w-40 px-3 py-2 text-left font-medium">VAT</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const amount = Number(l.quantity || 0) * Number(l.rate || 0);
                    return (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="px-3 py-3 align-top">
                          <div className="flex items-start gap-2">
                            <button
                              className="mt-1.5 text-muted-foreground hover:text-foreground"
                              aria-label="Drag row"
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded border bg-muted/30 text-muted-foreground">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <ItemPicker
                                value={l.item_id}
                                description={l.description}
                                items={items ?? []}
                                onPick={(id) => pickItem(idx, id)}
                                onDescriptionChange={(v) =>
                                  updateLine(idx, { item_id: null, description: v })
                                }
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={l.quantity}
                            onChange={(e) =>
                              updateLine(idx, { quantity: parseFloat(e.target.value) || 0 })
                            }
                            className="h-9 text-right"
                          />
                        </td>
                        <td className="px-3 py-3 align-top text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={l.rate}
                            onChange={(e) =>
                              updateLine(idx, { rate: parseFloat(e.target.value) || 0 })
                            }
                            className="h-9 text-right"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <Select
                            value={String(l.tax_rate)}
                            onValueChange={(v) => updateLine(idx, { tax_rate: parseFloat(v) })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select a VAT" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">No VAT (0%)</SelectItem>
                              {taxRates?.map((t: any) => (
                                <SelectItem key={t.id} value={String(t.rate)}>
                                  {t.name} ({t.rate}%)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-3 align-top text-right tabular-nums">
                          {amount.toFixed(2)}
                        </td>
                        <td className="px-2 py-3 align-top text-right">
                          {lines.length > 1 && (
                            <button
                              onClick={() => removeLine(idx)}
                              className="text-muted-foreground hover:text-rose-500"
                              aria-label="Remove row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addLine}
                  className="h-9 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                >
                  <Plus className="h-4 w-4" /> Add New Row
                  <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                >
                  <Plus className="h-4 w-4" /> Add Items in Bulk
                </Button>
              </div>
              <div className="w-full max-w-sm rounded-md border bg-muted/20 px-4 py-3 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span className="tabular-nums">{subtotal.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
                  <span>Total ( {currency} )</span>
                  <span className="tabular-nums">{total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="border-t pt-6">
            <Field label="Customer Notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[64px] max-w-md"
              />
            </Field>
          </section>

          {/* Terms + Attachments */}
          <section className="mt-6 grid gap-6 rounded-md bg-muted/30 p-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">Terms & Conditions</h3>
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="min-h-[120px] bg-background"
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Attach File(s) to Quote</h3>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <Upload className="h-4 w-4" /> Upload File <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                You can upload a maximum of 5 files, 10MB each
              </p>
            </div>
          </section>

          <p className="mt-6 text-xs text-muted-foreground">
            <span className="font-medium">Additional Fields:</span> Start adding custom fields for
            your quotes by going to <em>Settings</em> → <em>Sales</em> → <em>Quotes</em>.
          </p>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t bg-card px-6 py-3">
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={save.isPending}
          onClick={() => save.mutate(false)}
        >
          Save as Draft
        </Button>
        <Button
          size="sm"
          className="h-9 bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={save.isPending}
          onClick={() => save.mutate(true)}
        >
          {save.isPending ? "Saving…" : "Save and Send"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => navigate({ to: "/quotes" })}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-4">
      <label
        className={`pt-2 text-sm ${required ? "text-rose-500" : "text-foreground"} flex items-center gap-1`}
      >
        {label}
        {required && <span>*</span>}
        {hint && (
          <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-muted text-[9px] text-muted-foreground">
            i
          </span>
        )}
      </label>
      <div>{children}</div>
    </div>
  );
}

function ItemPicker({
  value,
  description,
  items,
  onPick,
  onDescriptionChange,
}: {
  value: string | null;
  description: string;
  items: Array<{ id: string; name: string; selling_price: number | null }>;
  onPick: (id: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative">
      <input
        value={value ? description : query || description}
        onChange={(e) => {
          if (value) onDescriptionChange(e.target.value);
          else {
            setQuery(e.target.value);
            onDescriptionChange(e.target.value);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Type or click to select an item."
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border bg-popover shadow-md">
          {filtered.slice(0, 20).map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => {
                onPick(i.id);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span>{i.name}</span>
              <span className="text-xs text-muted-foreground">
                {i.selling_price != null ? Number(i.selling_price).toFixed(2) : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
