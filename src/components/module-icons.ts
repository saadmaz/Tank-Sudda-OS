import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  Receipt,
  Settings,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@/lib/permissions";

export const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  leads: Inbox,
  inspections: ClipboardCheck,
  jobs: Wrench,
  schedule: CalendarDays,
  customers: Users,
  billing: Receipt,
  reports: BarChart3,
  staff: UserCog,
  settings: Settings,
};
