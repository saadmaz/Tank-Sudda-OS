// Every write the app makes to jobs and customers goes through here, so the
// stored shape, the computed totals, timestamps and audit entries stay
// consistent no matter which screen made the change. Writes are batched so
// a job and its customer are saved together, and they queue while offline.

import { collection, deleteDoc, doc, writeBatch } from "firebase/firestore";
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
