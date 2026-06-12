import { createFileRoute } from "@tanstack/react-router";
import { LocationForm } from "@/components/location-form";

export const Route = createFileRoute("/_authenticated/settings_/locations_/new")({
  head: () => ({ meta: [{ title: "New Location — Nimbus ERP" }] }),
  component: () => <LocationForm />,
});
