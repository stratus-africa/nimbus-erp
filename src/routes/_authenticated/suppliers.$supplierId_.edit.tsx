import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SupplierFormPage } from "./suppliers.new";

export const Route = createFileRoute("/_authenticated/suppliers/$supplierId_/edit")({
  head: () => ({ meta: [{ title: "Edit Supplier — Nimbus ERP" }] }),
  component: EditSupplierRoute,
});

function paymentTermsLabel(days: number | null | undefined) {
  if (days == null || days === 0) return "Due on Receipt";
  return `Net ${days}`;
}

function splitContactPerson(contact: string | null | undefined) {
  const parts = (contact ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { salutation: "", first_name: "", last_name: "" };
  const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];
  let salutation = "";
  if (SALUTATIONS.includes(parts[0])) salutation = parts.shift()!;
  const last_name = parts.pop() ?? "";
  const first_name = parts.join(" ");
  return { salutation, first_name, last_name };
}

function EditSupplierRoute() {
  const { supplierId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading supplier…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">Supplier not found.</p>
        <button className="text-sm text-primary hover:underline" onClick={() => navigate({ to: "/suppliers" })}>
          Back to suppliers
        </button>
      </div>
    );
  }

  const s = data as any;
  const contact = splitContactPerson(s.contact_person);
  const initial = {
    supplier_type: "business" as const,
    salutation: contact.salutation,
    first_name: contact.first_name,
    last_name: contact.last_name || s.name || "",
    display_name: s.name ?? "",
    email: s.email ?? "",
    work_phone: s.phone ?? "",
    vat_registration_no: s.vat_number ?? "",
    billing_address: s.address ?? "",
    payment_terms: paymentTermsLabel(s.payment_terms_days),
    remarks: s.notes ?? "",
    vat_treatment: s.vat_number ? "VAT Registered" : "Non VAT Registered",
  };

  return <SupplierFormPage supplierId={supplierId} initial={initial} />;
}
