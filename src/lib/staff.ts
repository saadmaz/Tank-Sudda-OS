// Staff directory shape and pure helpers. Shared by client, server and scripts.

import type { ModuleKey, StaffRole } from "./permissions";

/** What a staff member can be assigned to in the field. */
export type CrewRole = "supervisor" | "technician";

export const CREW_ROLES: { value: CrewRole; label: string }[] = [
  { value: "supervisor", label: "Supervisor" },
  { value: "technician", label: "Technician" },
];

/**
 * `staff/{id}`: the team directory, readable by every signed-in person.
 * Holds no credentials; the PIN hash and lockout state live in the
 * server-only `staffCredentials/{id}` document.
 */
export interface StaffMember {
  id: string;
  name: string;
  phone: string;
  /** Field assignments this person can take (supervisor, technician or both). */
  crewRoles: CrewRole[];
  active: boolean;
  /** Present only when this person can sign in. */
  login: StaffLogin | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffLogin {
  username: string;
  role: StaffRole;
  permissions: ModuleKey[];
}

export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
export const PIN_RE = /^\d{4}$/;

/** Usernames match case-insensitively; this is the key of `usernames/{key}`. */
export const usernameKey = (u: string) => u.trim().toLowerCase();

/** Trivially guessable PINs, rejected whenever someone chooses a PIN. */
export const WEAK_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "2345",
  "3456",
  "4567",
  "5678",
  "6789",
  "0123",
  "4321",
  "9876",
  "1212",
]);

export const isWeakPin = (pin: string) => WEAK_PINS.has(pin);

/** Failed attempts allowed before the account locks. */
export const MAX_FAILED_ATTEMPTS = 5;

/** Lockout grows with each further failure: 5, 15, then 60 minutes. */
export function lockoutMinutes(failCount: number): number {
  if (failCount < MAX_FAILED_ATTEMPTS) return 0;
  const over = failCount - MAX_FAILED_ATTEMPTS;
  return over === 0 ? 5 : over === 1 ? 15 : 60;
}

export const STAFF_COLORS = [
  "#4ba7db",
  "#12345c",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
];

/** Two-letter initials for avatars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Active people who can take a given field assignment, sorted by name. */
export function crewFor(staff: readonly StaffMember[], role: CrewRole): StaffMember[] {
  return staff
    .filter((s) => s.active && s.crewRoles.includes(role))
    .sort((a, b) => a.name.localeCompare(b.name));
}
