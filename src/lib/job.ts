// A job carries one piece of work from first enquiry to completion. Leads and
// Jobs are two views of the same `jobs` collection: a lead is a job that is
// still `new` or `quoted`. Pure: no firebase/react imports.

import { formatLKR } from "./currency";
import { formatPhone } from "./phone";
import { describeWork, priceSummary, type AddOn, type SumpItem, type TankItem } from "./pricing";

export const JOB_STATUSES = [
  "new",
  "quoted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const STATUS_LABEL: Record<JobStatus, string> = {
  new: "New lead",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type StatusTone = "info" | "brand" | "warning" | "success" | "danger" | "neutral" | "solid";

export const STATUS_TONE: Record<JobStatus, StatusTone> = {
  new: "info",
  quoted: "brand",
  scheduled: "warning",
  in_progress: "solid",
  completed: "success",
  cancelled: "danger",
};

export const LEAD_STATUSES: JobStatus[] = ["new", "quoted"];
export const WORK_STATUSES: JobStatus[] = ["scheduled", "in_progress", "completed", "cancelled"];
export const OPEN_STATUSES: JobStatus[] = ["new", "quoted", "scheduled", "in_progress"];

/**
 * Legal moves between statuses. Mirrored by legalJobTransitions() in
 * firestore.rules; keep the two in step.
 */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  new: ["quoted", "scheduled", "cancelled"],
  quoted: ["new", "scheduled", "cancelled"],
  scheduled: ["quoted", "in_progress", "completed", "cancelled"],
  in_progress: ["scheduled", "completed", "cancelled"],
  completed: ["in_progress"],
  cancelled: ["new"],
};

export const canMove = (from: JobStatus, to: JobStatus) =>
  from === to || JOB_TRANSITIONS[from].includes(to);

export const JOB_SOURCES = [
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "repeat", label: "Repeat customer" },
  { value: "social", label: "Social media" },
  { value: "walk-in", label: "Walk-in" },
  { value: "other", label: "Other" },
] as const;

export type JobSource = (typeof JOB_SOURCES)[number]["value"];

export const CANCEL_REASONS = [
  "Price too high",
  "Chose another provider",
  "No response",
  "Date not suitable",
  "Outside service area",
  "Duplicate",
  "Customer changed mind",
  "Other",
] as const;

export interface Job {
  /** Human-readable reference, also the document id, e.g. TS-261118-K7Q2. */
  id: string;
  status: JobStatus;
  source: JobSource;

  customerId: string;
  customerName: string;
  phone: string;
  altPhone: string;
  address: string;
  locationId: string;
  locationName: string;
  insideColombo: boolean;

  tanks: TankItem[];
  sumps: SumpItem[];
  transportFee: number;
  ladderNeeded: boolean;
  ladderFee: number;
  addOns: AddOn[];
  discount: number;
  /** Stored for queries and reports; always recomputed on save. */
  subtotal: number;
  total: number;

  /** YYYY-MM-DD. Empty until scheduled. */
  date: string;
  /** YYYY-MM-DD for multi-day jobs, otherwise empty. */
  endDate: string;
  /** HH:MM. */
  time: string;
  inspectionNeeded: boolean;

  supervisorId: string;
  technicianIds: string[];
  equipmentIds: string[];

  notes: string;
  cancelReason: string;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  /** YYYY-MM-DD the enquiry came in; editable for back-dated leads. */
  intakeDate: string;
  quotedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;

  isDeleted: boolean;
  deletedAt: string | null;
}

/** Fields the editor manages; ids, audit fields and totals are filled on save. */
export type JobDraft = Omit<
  Job,
  | "id"
  | "subtotal"
  | "total"
  | "createdAt"
  | "createdBy"
  | "updatedAt"
  | "updatedBy"
  | "quotedAt"
  | "startedAt"
  | "completedAt"
  | "cancelledAt"
  | "isDeleted"
  | "deletedAt"
>;

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** TS-YYMMDD-XXXX: sortable by day, readable on the phone, safe offline. */
export function newJobRef(now = new Date(), random: () => number = Math.random): string {
  const y = String(now.getFullYear()).slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)];
  return `TS-${y}${m}${d}-${suffix}`;
}

/** Local calendar date as YYYY-MM-DD (never UTC, which is a day behind before 05:30). */
export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const isLead = (j: Pick<Job, "status">) => LEAD_STATUSES.includes(j.status);

/** Timestamp fields to set when a job moves to `to`. */
export function statusStamps(to: JobStatus, now = new Date().toISOString()): Partial<Job> {
  switch (to) {
    case "quoted":
      return { quotedAt: now };
    case "in_progress":
      return { startedAt: now };
    case "completed":
      return { completedAt: now };
    case "cancelled":
      return { cancelledAt: now };
    default:
      return {};
  }
}

/** Every calendar day a job occupies (one for single-day jobs). */
export function jobDays(j: Pick<Job, "date" | "endDate">): string[] {
  if (!j.date) return [];
  const end = j.endDate && j.endDate > j.date ? j.endDate : j.date;
  const days: string[] = [];
  const cur = new Date(`${j.date}T00:00:00`);
  for (let i = 0; i < 60; i++) {
    const day = isoDate(cur);
    days.push(day);
    if (day >= end) break;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function scheduleLabel(j: Pick<Job, "date" | "endDate" | "time">): string {
  if (!j.date) return "Not scheduled";
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const range =
    j.endDate && j.endDate > j.date ? `${fmt(j.date)} – ${fmt(j.endDate)}` : fmt(j.date);
  return j.time ? `${range}, ${j.time}` : range;
}

export function jobService(j: Pick<Job, "tanks" | "sumps">): string {
  return describeWork(j);
}

/** Recomputes the stored subtotal and total from the work on the job. */
export function withTotals<T extends Omit<JobDraft, never>>(
  j: T,
): T & { subtotal: number; total: number } {
  const s = priceSummary(j);
  return { ...j, subtotal: s.subtotal, total: s.total };
}

/** Plain-text job sheet for WhatsApp, as the legacy "copy details" button produced. */
export function jobSummaryText(
  j: Job,
  names: { supervisor?: string; technicians?: string[]; equipment?: string[] } = {},
): string {
  const s = priceSummary(j);
  const lines = [
    "*JOB DETAILS - TANK SUDDA*",
    "-------------------------",
    `*Ref:* ${j.id}`,
    `*Customer:* ${j.customerName}`,
    `*Contact:* ${formatPhone(j.phone)}${j.altPhone ? ` / ${formatPhone(j.altPhone)}` : ""}`,
    `*Address:* ${j.address || "-"}`,
    `*Location:* ${j.locationName || "-"}`,
    "",
    `*Service:* ${describeWork(j)}`,
    ...s.lines.map(
      (l) => `- ${l.title}${l.detail ? ` (${l.detail})` : ""}${l.qty > 1 ? ` × ${l.qty}` : ""}`,
    ),
    `*Ladder required:* ${j.ladderNeeded ? "Yes" : "No"}`,
    `*Schedule:* ${scheduleLabel(j)}`,
    "",
    `*Supervisor:* ${names.supervisor || "Unassigned"}`,
    `*Technicians:* ${names.technicians?.length ? names.technicians.join(", ") : "Unassigned"}`,
    `*Equipment:* ${names.equipment?.length ? names.equipment.join(", ") : "Unassigned"}`,
    "",
    `*Total:* ${formatLKR(s.total)}${s.discount ? ` (after ${formatLKR(s.discount)} discount)` : ""}`,
    `*Notes:* ${j.notes || "-"}`,
  ];
  return lines.join("\n");
}

export interface JobFilter {
  query: string;
  status: JobStatus | "all";
  area: "all" | "inside" | "outside";
  trash: boolean;
}

/** Search by customer, reference, phone or address, plus status, area and trash. */
export function filterJobs(jobs: readonly Job[], f: JobFilter): Job[] {
  const q = f.query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  return jobs.filter((j) => {
    if (!!j.isDeleted !== f.trash) return false;
    if (f.status !== "all" && j.status !== f.status) return false;
    if (f.area === "inside" && !j.insideColombo) return false;
    if (f.area === "outside" && j.insideColombo) return false;
    if (!q) return true;
    return (
      j.customerName.toLowerCase().includes(q) ||
      j.id.toLowerCase().includes(q) ||
      j.address.toLowerCase().includes(q) ||
      (digits.length >= 3 &&
        (j.phone.replace(/\D/g, "").includes(digits) ||
          j.altPhone.replace(/\D/g, "").includes(digits)))
    );
  });
}

/** Newest first by intake, then by creation time. */
export function byNewest(a: Job, b: Job): number {
  return b.intakeDate.localeCompare(a.intakeDate) || b.createdAt.localeCompare(a.createdAt);
}

/** Soonest first; unscheduled jobs last. */
export function bySchedule(a: Job, b: Job): number {
  if (!a.date !== !b.date) return a.date ? -1 : 1;
  return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
}
