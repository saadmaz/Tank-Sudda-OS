import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Loader2, ShieldOff } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { MODULES, moduleForPath } from "@/lib/permissions";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function Spinner() {
  return (
    <div className="flex h-full min-h-40 w-full items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

function AppLayout() {
  const { session, loading, can } = useAuth();
  const { ready } = useStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <div className="h-screen">
        <Spinner />
      </div>
    );
  }
  if (!session) return <Navigate to="/" />;
  if (session.mustChangePin) return <Navigate to="/change-pin" />;

  // Convenience guard only: firestore.rules enforce the same permissions.
  const moduleKey = moduleForPath(pathname);
  if (moduleKey && !can(moduleKey)) {
    const fallback = MODULES.find((m) => can(m.key));
    return fallback ? <Navigate to={fallback.route} /> : <NoAccess />;
  }

  return (
    <div className="flex h-dvh w-full bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-muted/40">
          {ready ? <Outlet /> : <Spinner />}
        </main>
      </div>
    </div>
  );
}

/** Reachable only if someone was saved with no modules at all. */
function NoAccess() {
  const { session, logout } = useAuth();
  return (
    <div className="grid h-screen w-full place-items-center bg-background px-4">
      <div className="max-w-sm text-center">
        <ShieldOff className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-lg font-bold">No modules assigned</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {session?.name}, your account has no sections enabled yet. Ask an administrator to grant
          you access.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
