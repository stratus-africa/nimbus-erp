import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomizations, type CustomizationTable } from "@/hooks/use-tenant-customizations";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  helpText?: string;
};

export type ColumnDef = { key: string; label: string; render?: (row: any) => React.ReactNode };

type Props = {
  title: string;
  description?: string;
  table: CustomizationTable;
  entity: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  defaultRow?: Record<string, any>;
  validate?: (row: Record<string, any>) => string | null;
};

export function CustomizationCrudTab({
  title, description, table, entity, columns, fields, defaultRow = {}, validate,
}: Props) {
  const { list, create, update, remove } = useCustomizations<any>(table, entity);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const startNew = () => { setEditing({ ...defaultRow }); setOpen(true); };
  const startEdit = (row: any) => { setEditing(row); setOpen(true); };

  const onSave = async (row: Record<string, any>) => {
    const err = validate?.(row);
    if (err) { toast.error(err); return; }
    try {
      if (row.id) await update.mutateAsync({ id: row.id, patch: row });
      else await create.mutateAsync(row);
      toast.success("Saved");
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    }
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await remove.mutateAsync(deleteId);
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        </div>
        <Button onClick={startNew} size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add</Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              {columns.map((c) => <th key={c.key} className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wide">{c.label}</th>)}
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</td></tr>
            ) : !list.data?.length ? (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">No entries yet.</td></tr>
            ) : list.data.map((row: any) => (
              <tr key={row.id} className="border-t hover:bg-muted/20">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600" onClick={() => setDeleteId(row.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit" : "Add"} {title.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <EntityForm
              fields={fields}
              value={editing}
              onChange={setEditing}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => editing && onSave(editing)} disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-rose-600 hover:bg-rose-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EntityForm({
  fields, value, onChange,
}: {
  fields: FieldDef[];
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
}) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.name} className="space-y-1">
          <Label className="text-xs">
            {f.label}{f.required && <span className="text-rose-500"> *</span>}
          </Label>
          {f.type === "text" && (
            <Input value={value[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} />
          )}
          {f.type === "textarea" && (
            <Textarea value={value[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} rows={3} />
          )}
          {f.type === "number" && (
            <Input type="number" value={value[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value === "" ? null : Number(e.target.value))} />
          )}
          {f.type === "boolean" && (
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={!!value[f.name]} onCheckedChange={(v) => set(f.name, v)} />
              <span className="text-xs text-muted-foreground">{value[f.name] ? "Yes" : "No"}</span>
            </div>
          )}
          {f.type === "select" && (
            <Select value={value[f.name] ?? ""} onValueChange={(v) => set(f.name, v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {f.helpText && <p className="text-[11px] text-muted-foreground">{f.helpText}</p>}
        </div>
      ))}
    </div>
  );
}
