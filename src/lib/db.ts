// Every write the app makes to jobs and customers goes through here, so the
// stored shape, the computed totals, timestamps and audit entries stay
// consistent no matter which screen made the change. Writes are batched so
// a job and its customer are saved together, and they queue while offline.

import {
  collection,
  deleteDoc,
  doc,
  increment,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { logAudit } from "./audit";
import { addMonths, newSiteId, type Customer, type Site } from "./customer";
import {
  canMove,
  isoDate,
  newJobRef,
  statusStamps,
  withTotals,
  STATUS_LABEL,
  type Job,
  type JobDraft,
  type JobStatus,
} from "./job";
import { phoneKey, toE164 } from "./phone";
import type { Inspection } from "./inspection";
import {
  docNumber,
  paidOf,
  paymentStatusFor,
  profitOf,
  sumExpenses,
  type Expense,
  type Payment,
  type PaymentMethod,
} from "./billing";
import { roundMoney } from "./currency";
import { priceSummary } from "./pricing";

const now = () => new Date().toISOString();
const me = () => auth.currentUser?.uid ?? "";

export type CustomerChoice =
  { kind: "existing"; customer: Customer } | { kind: "new"; type: Customer["type"]; email: string };

/**
 * Creates or updates a job. A new customer is created alongside it, and an
 * existing customer gains the job's address as a new site if it wasn't one.
 */
export async function saveJob(
  draft: JobDraft,
  choice: CustomerChoice,
  existing?: Job,
): Promise<Job> {
  const batch = writeBatch(db);
  const ts = now();
  const phone = toE164(draft.phone) ?? draft.phone.trim();
  const altPhone = draft.altPhone ? (toE164(draft.altPhone) ?? draft.altPhone.trim()) : "";

  let customerId: string;
  if (choice.kind === "existing") {
    const c = choice.customer;
    customerId = c.id;
    const hasSite = c.sites.some(
      (s) => s.address.trim().toLowerCase() === draft.address.trim().toLowerCase(),
    );
    const sites: Site[] =
      hasSite || !draft.address.trim()
        ? c.sites
        : [
            ...c.sites,
            {
              id: newSiteId(),
              label: c.sites.length ? `Site ${c.sites.length + 1}` : "Home",
              address: draft.address.trim(),
              locationId: draft.locationId,
              accessNotes: "",
            },
          ];
    batch.update(doc(db, "customers", c.id), {
      name: draft.customerName.trim(),
      phone,
      phoneKey: phoneKey(phone),
      altPhone,
      sites,
      updatedAt: ts,
    });
  } else {
    const ref = doc(collection(db, "customers"));
    customerId = ref.id;
    const customer: Customer = {
      id: ref.id,
      name: draft.customerName.trim(),
      phone,
      phoneKey: phoneKey(phone),
      altPhone,
      email: choice.email.trim(),
      type: choice.type,
      sites: draft.address.trim()
        ? [
            {
              id: newSiteId(),
              label: choice.type === "commercial" ? "Main site" : "Home",
              address: draft.address.trim(),
              locationId: draft.locationId,
              accessNotes: "",
            },
          ]
        : [],
      notes: "",
      marketingConsent: false,
      createdAt: ts,
      updatedAt: ts,
      lastServiceDate: null,
      nextDueDate: null,
      isDeleted: false,
    };
    batch.set(ref, customer);
  }

  const job: Job = withTotals({
    ...draft,
    customerId,
    customerName: draft.customerName.trim(),
    phone,
    altPhone,
    address: draft.address.trim(),
    id: existing?.id ?? newJobRef(),
    createdAt: existing?.createdAt ?? ts,
    createdBy: existing?.createdBy ?? me(),
    updatedAt: ts,
    updatedBy: me(),
    quotedAt: existing?.quotedAt ?? null,
    startedAt: existing?.startedAt ?? null,
    completedAt: existing?.completedAt ?? null,
    cancelledAt: existing?.cancelledAt ?? null,
    isDeleted: existing?.isDeleted ?? false,
    deletedAt: existing?.deletedAt ?? null,
    ...(existing && existing.status !== draft.status ? statusStamps(draft.status, ts) : {}),
    ...(!existing && draft.status !== "new" ? statusStamps(draft.status, ts) : {}),
  });

  job.paymentStatus = paymentStatusFor(job.total, paidOf(job));
  batch.set(doc(db, "jobs", job.id), job);
  await batch.commit();
  logAudit({
    action: existing ? "job.update" : "job.create",
    entity: "job",
    entityId: job.id,
    summary: existing
      ? `Updated ${job.id} for ${job.customerName}`
      : `Created ${job.id} for ${job.customerName}`,
  });
  return job;
}

/**
 * Moves a job to a new status. Completing a job records the customer's last
 * service and schedules their next cleaning.
 */
export async function setJobStatus(
  job: Job,
  to: JobStatus,
  opts: { cancelReason?: string; recleanMonths?: number } = {},
): Promise<void> {
  if (!canMove(job.status, to)) {
    throw new Error(`A job can't move from ${STATUS_LABEL[job.status]} to ${STATUS_LABEL[to]}.`);
  }
  const ts = now();
  const batch = writeBatch(db);
  batch.update(doc(db, "jobs", job.id), {
    status: to,
    updatedAt: ts,
    updatedBy: me(),
    ...statusStamps(to, ts),
    ...(to === "cancelled" ? { cancelReason: opts.cancelReason ?? "" } : {}),
    ...(to === "new" ? { cancelReason: "" } : {}),
  });
  if (to === "completed" && job.customerId) {
    const served = job.endDate || job.date || isoDate();
    batch.update(doc(db, "customers", job.customerId), {
      lastServiceDate: served,
      nextDueDate: addMonths(served, opts.recleanMonths ?? 6),
      updatedAt: ts,
    });
  }
  await batch.commit();
  logAudit({
    action: "job.status",
    entity: "job",
    entityId: job.id,
    summary: `${job.id}: ${STATUS_LABEL[job.status]} → ${STATUS_LABEL[to]}${opts.cancelReason ? ` (${opts.cancelReason})` : ""}`,
  });
}

/** Assigns crew or equipment without opening the editor. */
export async function assignJob(
  job: Job,
  patch: Partial<Pick<Job, "supervisorId" | "technicianIds" | "equipmentIds">>,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "jobs", job.id), { ...patch, updatedAt: now(), updatedBy: me() });
  await batch.commit();
}

export async function setJobDeleted(job: Job, deleted: boolean): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "jobs", job.id), {
    isDeleted: deleted,
    deletedAt: deleted ? now() : null,
    updatedAt: now(),
    updatedBy: me(),
  });
  await batch.commit();
  logAudit({
    action: deleted ? "job.trash" : "job.restore",
    entity: "job",
    entityId: job.id,
    summary: `${deleted ? "Moved" : "Restored"} ${job.id} ${deleted ? "to" : "from"} the trash`,
  });
}

/** Permanent. Only from the trash, and only Manager and above (enforced by rules). */
export async function purgeJob(job: Job): Promise<void> {
  await deleteDoc(doc(db, "jobs", job.id));
  logAudit({
    action: "job.delete",
    entity: "job",
    entityId: job.id,
    summary: `Permanently deleted ${job.id} (${job.customerName})`,
  });
}

export async function saveCustomer(c: Customer): Promise<void> {
  const phone = toE164(c.phone) ?? c.phone.trim();
  const batch = writeBatch(db);
  batch.set(doc(db, "customers", c.id), {
    ...c,
    name: c.name.trim(),
    phone,
    phoneKey: phoneKey(phone),
    updatedAt: now(),
  });
  await batch.commit();
  logAudit({
    action: "customer.update",
    entity: "customer",
    entityId: c.id,
    summary: `Updated customer ${c.name.trim()}`,
  });
}

// ── Inspections ──────────────────────────────────────────────────────────────

/** Creates or updates an inspection. A linked lead is marked as needing one. */
export async function saveInspection(i: Inspection, isNew: boolean): Promise<void> {
  const batch = writeBatch(db);
  const ts = now();
  batch.set(doc(db, "inspections", i.id), {
    ...i,
    createdAt: isNew ? ts : i.createdAt,
    createdBy: isNew ? me() : i.createdBy,
    updatedAt: ts,
  });
  if (isNew && i.jobId) {
    batch.update(doc(db, "jobs", i.jobId), {
      inspectionNeeded: true,
      updatedAt: ts,
      updatedBy: me(),
    });
  }
  await batch.commit();
  if (isNew) {
    logAudit({
      action: "inspection.create",
      entity: "inspection",
      entityId: i.id,
      summary: `Booked inspection ${i.id} for ${i.customerName}`,
    });
  }
}

export async function setInspectionStatus(
  i: Inspection,
  status: Inspection["status"],
): Promise<void> {
  const batch = writeBatch(db);
  const ts = now();
  batch.update(doc(db, "inspections", i.id), {
    status,
    updatedAt: ts,
    completedAt: status === "completed" ? ts : null,
  });
  await batch.commit();
  logAudit({
    action: "inspection.status",
    entity: "inspection",
    entityId: i.id,
    summary: `${i.id} marked ${status}`,
  });
}

/** Copies the measured tanks and sumps to the job, re-pricing it, and clears its inspection flag. */
export async function applyInspectionToJob(i: Inspection, job: Job): Promise<void> {
  const ts = now();
  const f = i.findings;
  const updated = withTotals({
    ...job,
    tanks: i.tanks.length ? i.tanks : job.tanks,
    sumps: i.sumps.length ? i.sumps : job.sumps,
    ladderNeeded: i.type === "tank" ? f.ladderRequired || job.ladderNeeded : job.ladderNeeded,
    inspectionNeeded: false,
  });
  const batch = writeBatch(db);
  batch.update(doc(db, "jobs", job.id), {
    tanks: updated.tanks,
    sumps: updated.sumps,
    ladderNeeded: updated.ladderNeeded,
    inspectionNeeded: false,
    subtotal: updated.subtotal,
    total: Math.min(updated.total, updated.subtotal),
    updatedAt: ts,
    updatedBy: me(),
  });
  batch.update(doc(db, "inspections", i.id), { appliedToJobAt: ts, updatedAt: ts });
  await batch.commit();
  logAudit({
    action: "job.update",
    entity: "job",
    entityId: job.id,
    summary: `Applied measurements from ${i.id} to ${job.id}`,
  });
}

// ── Billing ──────────────────────────────────────────────────────────────────

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  date: string;
  reference: string;
  note: string;
}

function paymentDoc(job: Job, p: PaymentInput, ts: string) {
  const ref = doc(collection(db, "payments"));
  const payment: Payment = {
    id: ref.id,
    jobId: job.id,
    customerId: job.customerId,
    customerName: job.customerName,
    amount: roundMoney(p.amount),
    method: p.method,
    date: p.date,
    reference: p.reference.trim(),
    note: p.note.trim(),
    receivedBy: me(),
    createdAt: ts,
    createdBy: me(),
    voided: false,
    voidReason: "",
    voidedAt: null,
  };
  return { ref, payment };
}

/** Records money received against a job and updates its balance. */
export async function recordPayment(job: Job, p: PaymentInput): Promise<Payment> {
  const ts = now();
  const { ref, payment } = paymentDoc(job, p, ts);
  const batch = writeBatch(db);
  batch.set(ref, payment);
  batch.update(doc(db, "jobs", job.id), {
    paidAmount: increment(payment.amount),
    paymentStatus: paymentStatusFor(job.total, paidOf(job) + payment.amount),
    updatedAt: ts,
    updatedBy: me(),
  });
  await batch.commit();
  logAudit({
    action: "payment.create",
    entity: "payment",
    entityId: ref.id,
    summary: `Received ${payment.amount} (${payment.method}) on ${job.id}`,
  });
  return payment;
}

export async function voidPayment(payment: Payment, job: Job, reason: string): Promise<void> {
  const ts = now();
  const batch = writeBatch(db);
  batch.update(doc(db, "payments", payment.id), { voided: true, voidReason: reason, voidedAt: ts });
  batch.update(doc(db, "jobs", job.id), {
    paidAmount: increment(-payment.amount),
    paymentStatus: paymentStatusFor(job.total, paidOf(job) - payment.amount),
    updatedAt: ts,
    updatedBy: me(),
  });
  await batch.commit();
  logAudit({
    action: "payment.void",
    entity: "payment",
    entityId: payment.id,
    summary: `Voided ${payment.amount} on ${job.id}: ${reason}`,
  });
}

export interface Settlement {
  discount: number;
  expenses: Expense[];
  finalPayment: PaymentInput | null;
  recleanMonths: number;
}

/**
 * Closes a job the way the legacy "settlement" did: final discount, the
 * expense breakdown and profit, an optional final payment, and completion.
 */
export async function settleJob(job: Job, s: Settlement): Promise<Job> {
  const ts = now();
  const summary = priceSummary({ ...job, discount: s.discount });
  const expenses = s.expenses.filter((e) => e.category.trim() && e.amount > 0);
  const batch = writeBatch(db);
  let paid = paidOf(job);
  if (s.finalPayment && s.finalPayment.amount > 0) {
    const { ref, payment } = paymentDoc(job, s.finalPayment, ts);
    batch.set(ref, payment);
    paid = roundMoney(paid + payment.amount);
  }
  const patch = {
    status: "completed" as const,
    completedAt: ts,
    discount: summary.discount,
    subtotal: summary.subtotal,
    total: summary.total,
    expenses,
    expenseTotal: sumExpenses(expenses),
    profit: profitOf(summary.total, expenses),
    paidAmount: paid,
    paymentStatus: paymentStatusFor(summary.total, paid),
    updatedAt: ts,
    updatedBy: me(),
  };
  batch.update(doc(db, "jobs", job.id), patch);
  if (job.customerId) {
    const served = job.endDate || job.date || isoDate();
    batch.update(doc(db, "customers", job.customerId), {
      lastServiceDate: served,
      nextDueDate: addMonths(served, s.recleanMonths),
      updatedAt: ts,
    });
  }
  await batch.commit();
  logAudit({
    action: "job.settle",
    entity: "job",
    entityId: job.id,
    summary: `Settled ${job.id}: total ${patch.total}, expenses ${patch.expenseTotal}, profit ${patch.profit}`,
  });
  return { ...job, ...patch };
}

/**
 * Gives a job its quote or invoice number, issued in order from
 * `counters/documents`. Needs a connection: numbers must never repeat.
 */
export async function issueNumber(
  job: Job,
  kind: "quote" | "invoice",
  startAt: number,
): Promise<string> {
  const existing = kind === "quote" ? job.quoteNo : job.invoiceNo;
  if (existing) return existing;
  const counterRef = doc(db, "counters", "documents");
  const no = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.data() as { quote?: number; invoice?: number } | undefined;
    const next = Math.max(data?.[kind] ?? startAt, startAt);
    tx.set(counterRef, { quote: data?.quote ?? 0, invoice: data?.invoice ?? 0, [kind]: next + 1 });
    const number = docNumber(kind === "quote" ? "Q" : "INV", next);
    tx.update(doc(db, "jobs", job.id), {
      ...(kind === "quote" ? { quoteNo: number } : { invoiceNo: number, invoiceDate: isoDate() }),
      updatedAt: now(),
      updatedBy: me(),
    });
    return number;
  });
  return no;
}
