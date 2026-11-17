import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/customers")({
  component: () => (
    <ComingSoon
      title="Customers"
      phase={2}
      summary="Customer profiles with every site, tank and past job."
    />
  ),
});
