// Single source of truth for roles and module access.
//
//   • Role: what you may DO. A seniority ladder; only Admin and above manage
//     staff, and nobody may grant a role above their own.
//   • Permissions: which modules you may SEE. An explicit per-person list an
//     administrator edits; the role only supplies the starting list.
//
// Both travel in the Firebase token claims (see src/server/auth.ts), so the UI
// and firestore.rules read exactly the same values. Keep this file free of
// firebase and react imports: client, server and scripts all import it.

export const STAFF_ROLES = [
  "Technician",
  "Supervisor",
  "Office",
  "Manager",
  "Admin",
  "SuperAdmin",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

const ROLE_RANK: Record<StaffRole, number> = {
  Technician: 1,
  Supervisor: 2,
  Office: 2,
  Manager: 3,
  Admin: 4,
  SuperAdmin: 5,
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  Technician: "Field crew. Sees assigned jobs and the schedule.",
  Supervisor: "Leads a crew. Runs inspections and jobs in the field.",
  Office: "Takes leads, books inspections, raises quotes and invoices.",
  Manager: "Runs operations, payments and reports.",
  Admin: "Manages staff and settings.",
  SuperAdmin: "Full access, including other administrators.",
};

export const isStaffRole = (v: unknown): v is StaffRole =>
  typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);

export const rank = (r: StaffRole) => ROLE_RANK[r];
export const isSuperAdmin = (r?: StaffRole | null) => r === "SuperAdmin";
export const isAdmin = (r?: StaffRole | null) => r === "Admin" || isSuperAdmin(r);
export const isManagerOrAbove = (r?: StaffRole | null) => r === "Manager" || isAdmin(r);

/** An administrator may act on someone strictly junior; a SuperAdmin on anyone. */
export function mayActOn(actor: StaffRole, target: StaffRole): boolean {
  return isSuperAdmin(actor) || rank(actor) > rank(target);
}

/** Nobody may grant a role senior to their own. */
export function mayAssignRole(actor: StaffRole, role: StaffRole): boolean {
  return isSuperAdmin(actor) || rank(role) <= rank(actor);
}

// ── Modules ──────────────────────────────────────────────────────────────────
// Order drives the sidebar and the permission checklist.

export const MODULES = [
  { key: "dashboard", label: "Dashboard", route: "/dashboard" },
  { key: "leads", label: "Leads", route: "/leads" },
  { key: "inspections", label: "Inspections", route: "/inspections" },
  { key: "jobs", label: "Jobs", route: "/jobs" },
  { key: "schedule", label: "Schedule", route: "/schedule" },
  { key: "customers", label: "Customers", route: "/customers" },
  { key: "billing", label: "Billing", route: "/billing" },
  { key: "reports", label: "Reports", route: "/reports" },
  { key: "staff", label: "Staff", route: "/staff" },
  { key: "settings", label: "Settings", route: "/settings" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const ALL_MODULES: ModuleKey[] = MODULES.map((m) => m.key);

const MODULE_KEYS = new Set<string>(ALL_MODULES);

export const isModuleKey = (v: unknown): v is ModuleKey =>
  typeof v === "string" && MODULE_KEYS.has(v);

/** Starting permission list when someone is given this role. */
export const ROLE_DEFAULT_PERMISSIONS: Record<StaffRole, ModuleKey[]> = {
  Technician: ["dashboard", "jobs", "schedule"],
  Supervisor: ["dashboard", "inspections", "jobs", "schedule", "customers"],
  Office: ["dashboard", "leads", "inspections", "jobs", "schedule", "customers", "billing"],
  Manager: ALL_MODULES.filter((m) => m !== "settings" && m !== "staff"),
  Admin: [...ALL_MODULES],
  SuperAdmin: [...ALL_MODULES],
};

/** A SuperAdmin always holds every module, so the business can never lock
 *  itself out of staff management by revoking the last administrator's access. */
export function hasModule(
  role: StaffRole | null | undefined,
  permissions: readonly string[] | null | undefined,
  moduleKey: ModuleKey,
): boolean {
  if (!role) return false;
  if (isSuperAdmin(role)) return true;
  return !!permissions?.includes(moduleKey);
}

/** The module a pathname belongs to; the longest matching route wins. */
export function moduleForPath(pathname: string): ModuleKey | null {
  let best: ModuleKey | null = null;
  let bestLen = 0;
  for (const m of MODULES) {
    if ((pathname === m.route || pathname.startsWith(m.route + "/")) && m.route.length > bestLen) {
      best = m.key;
      bestLen = m.route.length;
    }
  }
  return best;
}

/** Drops unknown keys and duplicates. Claims and documents are untrusted shapes. */
export function sanitizePermissions(input: unknown): ModuleKey[] {
  if (!Array.isArray(input)) return [];
  return ALL_MODULES.filter((k) => input.includes(k));
}

/** SuperAdmins hold everything; everyone else holds exactly what was granted. */
export function permissionsFor(role: StaffRole, requested: unknown): ModuleKey[] {
  return isSuperAdmin(role) ? [...ALL_MODULES] : sanitizePermissions(requested);
}
