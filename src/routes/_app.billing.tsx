import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/billing")({
  component: () => (
    <ComingSoon
      title="Billing"
      phase={5}
      summary="Quotes, invoices, instalment payments and job settlement."
    />
  ),
});
