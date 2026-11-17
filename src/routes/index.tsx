import { createFileRoute } from "@tanstack/react-router";
import { Droplets } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="grid min-h-screen place-items-center bg-navy px-4 text-navy-foreground">
      <div className="max-w-sm text-center">
        <img
          src="/brand/logo-badge-512.png"
          alt="Tank Sudda"
          width={96}
          height={96}
          className="mx-auto h-24 w-24"
        />
        <h1 className="mt-6 flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
          <Droplets className="h-6 w-6 text-sidebar-primary" aria-hidden />
          Tank Sudda OS
        </h1>
        <p className="mt-2 text-sm text-sidebar-foreground">
          Operations and point-of-sale platform. Staff sign-in arrives in the next release.
        </p>
      </div>
    </div>
  );
}
