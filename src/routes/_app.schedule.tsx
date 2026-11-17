import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/schedule")({
  component: () => (
    <ComingSoon
      title="Schedule"
      phase={4}
      summary="A calendar of inspections and multi-day jobs with crew assignment."
    />
  ),
});
