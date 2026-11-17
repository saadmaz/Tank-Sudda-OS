// WhatsApp message templates with {placeholders}, edited under Settings. Pure.

import { formatLKR } from "./currency";
import { scheduleLabel, type Job } from "./job";
import { balanceOf } from "./billing";

export type TemplateKey = "confirmation" | "reminder" | "payment" | "review" | "followUp";

export interface MessageTemplate {
  key: TemplateKey;
  label: string;
  text: string;
}

export const PLACEHOLDERS = [
  ["{name}", "Customer's first name"],
  ["{ref}", "Job reference"],
  ["{schedule}", "Date and time of the work"],
  ["{total}", "Job total"],
  ["{balance}", "Balance due"],
  ["{company}", "Company name"],
  ["{phone}", "Company phone"],
] as const;

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    key: "confirmation",
    label: "Booking confirmation",
    text: "Hi {name}, your tank cleaning with {company} is booked for {schedule} (ref {ref}). Please turn off the water supply to the tanks 24 hours before. Reply here if anything changes.",
  },
  {
    key: "followUp",
    label: "Quote follow-up",
    text: "Hi {name}, following up on your {company} quote ({ref}) for {total}. Would you like us to book a date?",
  },
  {
    key: "payment",
    label: "Payment reminder",
    text: "Hi {name}, thank you for choosing {company}. The balance for job {ref} is {balance}. You can pay by bank transfer or cash. Thank you!",
  },
  {
    key: "review",
    label: "Review request",
    text: "Hi {name}, thank you for having {company} clean your tanks. If you were happy with the work, a short review would mean a lot to us.",
  },
  {
    key: "reminder",
    label: "Re-clean reminder",
    text: "Hi {name}, it's been about six months since {company} last cleaned your tanks. Regular cleaning keeps your water safe. Shall we book your next visit? Call {phone} or reply here.",
  },
];

export function fillTemplate(
  text: string,
  vars: { name: string; company: string; phone: string; job?: Job },
): string {
  const first = vars.name.trim().split(/\s+/)[0] ?? "";
  const j = vars.job;
  const values: Record<string, string> = {
    "{name}": first,
    "{company}": vars.company,
    "{phone}": vars.phone,
    "{ref}": j?.id ?? "",
    "{schedule}": j ? scheduleLabel(j) : "",
    "{total}": j ? formatLKR(j.total) : "",
    "{balance}": j ? formatLKR(balanceOf(j)) : "",
  };
  return text.replace(/\{[a-z]+\}/g, (m) => values[m] ?? m);
}

/** Stored templates merged over the defaults, so new ones appear after upgrades. */
export function normalizeTemplates(stored: unknown): MessageTemplate[] {
  const list = Array.isArray(stored) ? (stored as Partial<MessageTemplate>[]) : [];
  return DEFAULT_TEMPLATES.map((d) => {
    const s = list.find((t) => t?.key === d.key);
    return typeof s?.text === "string" && s.text.trim() ? { ...d, text: s.text } : d;
  });
}
