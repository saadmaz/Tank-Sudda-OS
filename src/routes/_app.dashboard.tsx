import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { MODULE_ICONS } from "@/components/module-icons";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { MODULES } from "@/lib/permissions";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { session, can } = useAuth();
  const shortcuts = MODULES.filter((m) => m.key !== "dashboard" && can(m.key));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title={`${greeting()}, ${session?.name.split(" ")[0] ?? ""}`}
        description="Revenue, targets and today's work appear here as each module ships."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((m) => {
          const Icon = MODULE_ICONS[m.key];
          return (
            <Link key={m.key} to={m.route} className="group">
              <Card className="flex items-center gap-3 p-4 transition-colors group-hover:border-primary/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold">{m.label}</span>
                <ArrowRight
                  className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
