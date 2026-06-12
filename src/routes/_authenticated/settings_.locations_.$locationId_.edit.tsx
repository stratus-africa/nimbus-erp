import { createFileRoute } from "@tanstack/react-router";
import { LocationForm } from "@/components/location-form";

export const Route = createFileRoute("/_authenticated/settings_/locations_/$locationId_/edit")({
  head: () => ({ meta: [{ title: "Edit Location — Nimbus ERP" }] }),
  component: EditLocationPage,
});

function EditLocationPage() {
  const { locationId } = Route.useParams();
  return <LocationForm locationId={locationId} />;
}
