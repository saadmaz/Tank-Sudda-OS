import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/settings")({
  component: () => (
    <ComingSoon
      title="Settings"
      phase={1}
      summary="Company details, prices, locations, equipment, terms and targets."
    />
  ),
});
