// Customers and their sites. A customer is identified by phone number: the
// same number on a new lead (typed in the office or sent from the website) is
// matched to the existing profile instead of creating a duplicate.

import { phoneKey } from "./phone";

export interface Site {
  id: string;
  /** "Home", "Office", "Factory 2"... */
  label: string;
  address: string;
  locationId: string;
  /** Free-text notes for the crew: gate code, where the tank is, parking. */
  accessNotes: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  /** Canonical phone used to match the customer; see phoneKey(). */
  phoneKey: string;
  altPhone: string;
  email: string;
  type: "residential" | "commercial";
  sites: Site[];
  notes: string;
  /** Agreed to receive reminders and offers. */
  marketingConsent: boolean;
  createdAt: string;
  updatedAt: string;
  /** Updated when a job completes; drives re-clean reminders. */
  lastServiceDate: string | null;
  nextDueDate: string | null;
  isDeleted: boolean;
}

export const CUSTOMER_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
] as const;

/** Customers whose name or number matches what is being typed, best first. */
export function searchCustomers(
  customers: readonly Customer[],
  input: string,
  limit = 6,
): Customer[] {
  const q = input.trim().toLowerCase();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const scored: { c: Customer; score: number }[] = [];
  for (const c of customers) {
    if (c.isDeleted) continue;
    let score = 0;
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) score = 3;
    else if (name.includes(q)) score = 2;
    if (digits.length >= 4) {
      const all = `${c.phone} ${c.altPhone} ${c.phoneKey}`.replace(/\D/g, "");
      if (all.includes(digits) || all.includes(digits.replace(/^0/, "94")))
        score = Math.max(score, 4);
    }
    if (score) scored.push({ c, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((s) => s.c);
}

/** An existing customer with the same phone number, if any. */
export function findByPhone(customers: readonly Customer[], phone: string): Customer | undefined {
  const key = phoneKey(phone);
  if (!key) return undefined;
  return customers.find(
    (c) => !c.isDeleted && (c.phoneKey === key || phoneKey(c.altPhone) === key),
  );
}

/** YYYY-MM-DD `months` after `date`, clamped to the end of shorter months. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${mm}-${dd}`;
}

export function newSiteId(): string {
  return `site-${Math.random().toString(36).slice(2, 8)}`;
}
