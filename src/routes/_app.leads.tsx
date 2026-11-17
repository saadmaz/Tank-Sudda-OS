import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/leads")({
  component: () => (
    <ComingSoon
      title="Leads"
      phase={2}
      summary="New leads from the office and the website, with customer autofill, pricing and conversion to jobs."
    />
  ),
});
