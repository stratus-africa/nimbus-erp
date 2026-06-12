import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type DocActionsConfig = {
  docTable: string;
  linesTable?: string;
  fkLinesField?: string;
  numberField: string;
  numberingDocType?: string;
  // Field names whose values should NOT be copied when cloning (status/payments/etc.)
  cloneOmitFields?: string[];
  // Date field to reset to today on clone
  dateField?: string;
  // Field on parent row that references linked source (e.g. source_quote_id) — cleared on clone
  sourceRefFields?: string[];
  listRoute: string; // e.g. "/quotes"
  detailRoute: string; // e.g. "/quotes/$quoteId"
  detailParamKey: string; // e.g. "quoteId"
  label: string; // e.g. "Quote"
  // For payments without lines
  hasLines?: boolean;
  // Use soft-delete via deleted_at
  softDelete?: boolean;
};

export function DocActionsMenu({
  config,
  docId,
  invalidateKeys = [],
}: {
  config: DocActionsConfig;
  docId: string;
  invalidateKeys?: string[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const tenantId = profile?.currentTenant?.id;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const clone = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const { data: src, error: se } = await (supabase as any)
        .from(config.docTable)
        .select("*")
        .eq("id", docId)
        .single();
      if (se) throw se;

      const payload: any = { ...src };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.deleted_at;
      (config.cloneOmitFields ?? []).forEach((f) => delete payload[f]);
      (config.sourceRefFields ?? []).forEach((f) => (payload[f] = null));

      // Reset numbered field
      if (config.numberingDocType) {
        const { data: num, error: ne } = await supabase.rpc("next_doc_number", {
          _tenant: tenantId,
          _doc_type: config.numberingDocType,
        });
        if (ne) throw ne;
        payload[config.numberField] = num;
      } else {
        delete payload[config.numberField];
      }

      // Reset status, balances, dates
      if ("status" in payload) payload.status = "draft";
      if ("amount_paid" in payload) payload.amount_paid = 0;
      if ("balance_due" in payload && "total" in payload) payload.balance_due = payload.total;
      if (config.dateField) payload[config.dateField] = new Date().toISOString().slice(0, 10);

      const { data: ins, error: ie } = await (supabase as any)
        .from(config.docTable)
        .insert(payload)
        .select("id")
        .single();
      if (ie) throw ie;
      const newId = ins.id as string;

      if (config.hasLines && config.linesTable && config.fkLinesField) {
        const { data: lines, error: le } = await (supabase as any)
          .from(config.linesTable)
          .select("*")
          .eq(config.fkLinesField, docId)
          .order("position");
        if (le) throw le;
        if (lines?.length) {
          const lineRows = lines.map((l: any) => {
            const { id, created_at, updated_at, ...rest } = l;
            return { ...rest, [config.fkLinesField!]: newId };
          });
          const { error: lie } = await (supabase as any).from(config.linesTable).insert(lineRows);
          if (lie) throw lie;
        }
      }
      return newId;
    },
    onSuccess: (newId) => {
      toast.success(`${config.label} cloned`);
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      navigate({ to: config.detailRoute, params: { [config.detailParamKey]: newId } as any });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to clone"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (config.softDelete) {
        const { error } = await (supabase as any)
          .from(config.docTable)
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", docId);
        if (error) throw error;
      } else {
        if (config.hasLines && config.linesTable && config.fkLinesField) {
          await (supabase as any).from(config.linesTable).delete().eq(config.fkLinesField, docId);
        }
        const { error } = await (supabase as any).from(config.docTable).delete().eq("id", docId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`${config.label} deleted`);
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      navigate({ to: config.listRoute });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => clone.mutate()} disabled={clone.isPending}>
            <Copy className="mr-2 h-4 w-4" /> Clone
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {config.label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => remove.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
