import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { KeyRound, LogOut, Menu, WifiOff } from "lucide-react";
import { AppNav, BrandMark } from "./app-sidebar";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { MODULES } from "@/lib/permissions";
import { initials } from "@/lib/staff";

export function TopBar() {
  const { session, online, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title =
    MODULES.find((m) => pathname === m.route || pathname.startsWith(m.route + "/"))?.label ?? "";

  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open menu"
        onClick={() => setMenuOpen(true)}
      >
        <Menu />
      </Button>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="w-72 border-sidebar-border bg-sidebar p-0 py-5 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex flex-col gap-6">
            <BrandMark />
            <AppNav onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {!online && (
          <span className="flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Offline, changes will sync</span>
            <span className="sm:hidden">Offline</span>
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-bold text-navy-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Account"
            >
              {initials(session?.name ?? "")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm font-semibold">{session?.name}</p>
              <p className="text-xs font-normal text-muted-foreground">{session?.role}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/change-pin">
                <KeyRound className="h-4 w-4" /> Change PIN
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
