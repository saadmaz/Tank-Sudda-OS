import { Link, useRouterState } from "@tanstack/react-router";
import { MODULES } from "@/lib/permissions";
import { MODULE_ICONS } from "./module-icons";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Navigation list, shared by the desktop sidebar and the mobile drawer. */
export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
      {MODULES.filter((m) => can(m.key)).map((m) => {
        const Icon = MODULE_ICONS[m.key];
        const active = pathname === m.route || pathname.startsWith(m.route + "/");
        return (
          <Link
            key={m.key}
            to={m.route}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", active && "text-sidebar-primary")} aria-hidden />
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-6">
      <img src="/brand/logo-mark-128.png" alt="" width={32} height={32} className="h-8 w-8" />
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-white">Tank Sudda</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-primary">
          Operations
        </p>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="no-print hidden w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar py-5 lg:flex">
      <BrandMark />
      <AppNav />
    </aside>
  );
}
