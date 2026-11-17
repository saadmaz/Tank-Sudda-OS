import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/reports")({
  component: () => (
    <ComingSoon
      title="Reports"
      phase={6}
      summary="Daily ledger, reconciliation, analytics and CSV export."
    />
  ),
});
