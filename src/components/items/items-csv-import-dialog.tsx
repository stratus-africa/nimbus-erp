import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, AlertCircle, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onOpenChange: (o: boolean) => void };

// Allowed CSV columns -> items column
const COLS = [
  "name", "sku", "barcode", "description", "category", "item_type",
  "unit", "cost_price", "selling_price", "reorder_level", "is_active",
] as const;
type Col = (typeof COLS)[number];

type ParsedRow = {
  raw: Record<string, string>;
  mapped: Partial<Record<Col, any>>;
  errors: string[];
  match?: { id: string; by: "sku" | "name" };
  status: "new" | "update" | "error" | "dup_in_file";
};

// Minimal RFC-4180-ish CSV parser
function parseCSV(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some((v) => v !== "")) out.push(row);
        row = [];
      } else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); if (row.some((v) => v !== "")) out.push(row); }
  return out;
}

function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r.map((v) => {
        const s = v == null ? "" : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","),
    ).join("\n");
}

const TEMPLATE_HEADERS: Col[] = [
  "name", "sku", "barcode", "description", "category", "item_type",
  "unit", "cost_price", "selling_price", "reorder_level", "is_active",
];

const ITEM_TYPES = new Set(["inventory", "service", "non_inventory"]);

function coerceBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (["true", "1", "yes", "y", "active"].includes(s)) return true;
  if (["false", "0", "no", "n", "inactive"].includes(s)) return false;
  return null;
}
function coerceNum(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function ItemsCsvImportDialog({ open, onOpenChange }: Props) {
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");

  const existingQ = useQuery({
    enabled: !!tenantId && open,
    queryKey: ["items", tenantId, "for-import"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id,name,sku")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setParsed([]);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) {
      toast.error("Empty CSV");
      return;
    }
    const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const knownHeaders = headers.map((h) => (COLS as readonly string[]).includes(h) ? (h as Col) : null);
    if (!knownHeaders.includes("name")) {
      toast.error("Missing required column: name");
      return;
    }

    const existing = existingQ.data ?? [];
    const bySku = new Map<string, { id: string; name: string }>();
    const byName = new Map<string, { id: string; name: string }>();
    for (const e of existing) {
      if (e.sku) bySku.set(String(e.sku).toLowerCase(), e);
      if (e.name) byName.set(String(e.name).toLowerCase(), e);
    }

    const seenSku = new Map<string, number>();
    const seenName = new Map<string, number>();

    const out: ParsedRow[] = [];
    for (let r = 1; r < rows.length; r++) {
      const raw: Record<string, string> = {};
      const mapped: Partial<Record<Col, any>> = {};
      const errors: string[] = [];
      headers.forEach((h, idx) => {
        const v = (rows[r][idx] ?? "").trim();
        raw[h] = v;
        const col = knownHeaders[idx];
        if (!col) return;
        if (v === "") return;
        if (col === "cost_price" || col === "selling_price" || col === "reorder_level") {
          const n = coerceNum(v);
          if (n == null) errors.push(`${col} must be a number`);
          else mapped[col] = n;
        } else if (col === "is_active") {
          const b = coerceBool(v);
          if (b == null) errors.push(`is_active must be true/false`);
          else mapped[col] = b;
        } else if (col === "item_type") {
          const t = v.toLowerCase();
          if (!ITEM_TYPES.has(t)) errors.push(`item_type must be one of ${[...ITEM_TYPES].join(", ")}`);
          else mapped[col] = t;
        } else {
          mapped[col] = v;
        }
      });

      if (!mapped.name) errors.push("name is required");

      const sku = mapped.sku ? String(mapped.sku).toLowerCase() : "";
      const nameKey = mapped.name ? String(mapped.name).toLowerCase() : "";

      let status: ParsedRow["status"] = "new";
      let match: ParsedRow["match"];

      if (errors.length) {
        status = "error";
      } else {
        if (sku) {
          if (seenSku.has(sku)) { status = "dup_in_file"; errors.push(`Duplicate SKU "${sku}" earlier in file (row ${seenSku.get(sku)})`); }
          else seenSku.set(sku, r);
        }
        if (nameKey) {
          if (seenName.has(nameKey) && !sku) { status = "dup_in_file"; errors.push(`Duplicate name "${nameKey}" earlier in file (row ${seenName.get(nameKey)})`); }
          else if (!seenName.has(nameKey)) seenName.set(nameKey, r);
        }
        if (status !== "dup_in_file") {
          const m = (sku && bySku.get(sku)) || (nameKey && byName.get(nameKey));
          if (m) {
            match = { id: m.id, by: sku && bySku.get(sku) ? "sku" : "name" };
            status = "update";
          }
        }
      }

      out.push({ raw, mapped, errors, match, status });
    }

    setParsed(out);
  };

  const counts = useMemo(() => {
    const c = { total: parsed.length, new: 0, update: 0, error: 0, dup_in_file: 0 };
    for (const p of parsed) c[p.status]++;
    return c;
  }, [parsed]);

  const importable = useMemo(
    () => parsed.filter((p) => p.status === "new" || p.status === "update"),
    [parsed],
  );

  const run = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const inserts: any[] = [];
      const updates: { id: string; patch: any }[] = [];
      for (const p of importable) {
        const payload: any = { ...p.mapped };
        if (payload.item_type == null) payload.item_type = "inventory";
        if (p.status === "update" && p.match) {
          updates.push({ id: p.match.id, patch: payload });
        } else {
          inserts.push({ ...payload, tenant_id: tenantId });
        }
      }
      let inserted = 0, updated = 0;
      if (inserts.length) {
        const { error, count } = await supabase
          .from("items")
          .insert(inserts, { count: "exact" });
        if (error) throw error;
        inserted = count ?? inserts.length;
      }
      for (const u of updates) {
        const { error } = await supabase.from("items").update(u.patch).eq("id", u.id);
        if (error) throw error;
        updated++;
      }
      return { inserted, updated };
    },
    onSuccess: ({ inserted, updated }) => {
      toast.success(`Imported ${inserted} new, updated ${updated}`);
      qc.invalidateQueries({ queryKey: ["items"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Import failed"),
  });

  const downloadTemplate = () => {
    const sample = [
      ["Widget Blue", "WID-BLUE-001", "1234567890", "Blue widget", "Widgets", "inventory", "pcs", "5.00", "12.99", "10", "true"],
      ["Consulting Hour", "", "", "Professional service", "Services", "service", "hour", "0", "100", "0", "true"],
    ];
    const csv = toCSV([TEMPLATE_HEADERS as readonly string[] as string[], ...sample]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "items_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import items from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV. Existing items are matched by <strong>SKU</strong>, then by <strong>name</strong>, and will be updated. New rows are created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Choose CSV
            </Button>
            <Button variant="ghost" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" /> Download template
            </Button>
            {fileName && (
              <>
                <span className="text-sm text-muted-foreground ml-2">{fileName}</span>
                <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Reset
                </Button>
              </>
            )}
          </div>

          {parsed.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <Badge tone="default">{counts.total} rows</Badge>
                <Badge tone="emerald">{counts.new} new</Badge>
                <Badge tone="sky">{counts.update} update</Badge>
                <Badge tone="amber">{counts.dup_in_file} duplicates in file</Badge>
                <Badge tone="rose">{counts.error} errors</Badge>
              </div>

              <div className="rounded-md border max-h-[400px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5">#</th>
                      <th className="text-left px-2 py-1.5">Status</th>
                      <th className="text-left px-2 py-1.5">Name</th>
                      <th className="text-left px-2 py-1.5">SKU</th>
                      <th className="text-left px-2 py-1.5">Barcode</th>
                      <th className="text-right px-2 py-1.5">Cost</th>
                      <th className="text-right px-2 py-1.5">Price</th>
                      <th className="text-left px-2 py-1.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, idx) => (
                      <tr key={idx} className={cn("border-t",
                        p.status === "error" && "bg-rose-50 dark:bg-rose-950/30",
                        p.status === "dup_in_file" && "bg-amber-50 dark:bg-amber-950/30",
                        p.status === "update" && "bg-sky-50 dark:bg-sky-950/20",
                      )}>
                        <td className="px-2 py-1 text-muted-foreground">{idx + 2}</td>
                        <td className="px-2 py-1">
                          <StatusPill status={p.status} />
                        </td>
                        <td className="px-2 py-1">{p.raw.name}</td>
                        <td className="px-2 py-1">{p.raw.sku}</td>
                        <td className="px-2 py-1">{p.raw.barcode}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.raw.cost_price}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.raw.selling_price}</td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {p.errors.length ? (
                            <span className="text-rose-600">{p.errors.join("; ")}</span>
                          ) : p.match ? (
                            <span>Match by {p.match.by}</span>
                          ) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!importable.length || run.isPending}
            onClick={() => run.mutate()}
            className="gap-2"
          >
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Import {importable.length} {importable.length === 1 ? "row" : "rows"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Badge({ tone, children }: { tone: "default" | "emerald" | "sky" | "amber" | "rose"; children: React.ReactNode }) {
  const cls = {
    default: "bg-muted text-foreground",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  }[tone];
  return <span className={cn("rounded px-1.5 py-0.5 font-medium", cls)}>{children}</span>;
}

function StatusPill({ status }: { status: ParsedRow["status"] }) {
  if (status === "new") return <Badge tone="emerald">New</Badge>;
  if (status === "update") return <Badge tone="sky">Update</Badge>;
  if (status === "dup_in_file") return <Badge tone="amber">Duplicate</Badge>;
  return <Badge tone="rose"><AlertCircle className="inline h-3 w-3 mr-1" />Error</Badge>;
}
