import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/inspections")({
  component: () => (
    <ComingSoon
      title="Inspections"
      phase={3}
      summary="Tank, sump and cleaning site inspections with a printable report."
    />
  ),
});
