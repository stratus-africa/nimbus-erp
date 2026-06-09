import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CustomerFormPage } from "./customers.new";

export const Route = createFileRoute("/_authenticated/customers/$customerId/edit")({
  head: () => ({ meta: [{ title: "Edit Customer — Nimbus ERP" }] }),
  component: EditCustomerRoute,
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

function EditCustomerRoute() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading customer…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">Customer not found.</p>
        <button className="text-sm text-primary hover:underline" onClick={() => navigate({ to: "/customers" })}>
          Back to customers
        </button>
      </div>
    );
  }

  const c = data as any;
  const contact = splitContactPerson(c.contact_person);
  const initial = {
    customer_type: "business" as const,
    salutation: contact.salutation,
    first_name: contact.first_name,
    last_name: contact.last_name || c.name || "",
    company_name: c.company_name ?? "",
    display_name: c.name ?? "",
    email: c.email ?? "",
    work_phone: c.phone ?? "",
    vat_registration_no: c.vat_number ?? "",
    tax_exemption_no: "",
    billing_address: c.billing_address ?? "",
    shipping_address: c.shipping_address ?? "",
    payment_terms: paymentTermsLabel(c.payment_terms_days),
    remarks: c.notes ?? "",
    vat_treatment: c.vat_number ? "VAT Registered" : "Non VAT Registered",
  };

  return <CustomerFormPage customerId={customerId} initial={initial} />;
}
