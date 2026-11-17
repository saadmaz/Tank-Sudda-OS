// Maps records from the legacy single-file app (Firestore `orders` and
// `config/general`) to this system's customers, jobs, payments, inspections
// and settings. Pure; used by scripts/import-legacy.ts. Legacy documents are
// loosely shaped, so every field is read defensively.

import type { Payment, PaymentMethod } from "./billing";
import { paymentStatusFor } from "./billing";
import { roundMoney, toAmount } from "./currency";
import type { Customer } from "./customer";
import { addMonths } from "./customer";
import { DEFAULT_FINDINGS, type Inspection, type InspectionType } from "./inspection";
import { isoDate, type Job, type JobStatus } from "./job";
import { phoneKey, toE164 } from "./phone";
import { priceSummary, type SumpItem, type TankItem } from "./pricing";
import { DEFAULT_SETTINGS, DEFAULT_TERMS, slugId, type Settings } from "./settings";
import type { StaffMember } from "./staff";

type Raw = Record<string, unknown>;
const str = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const arr = (v: unknown): Raw[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
const bool = (v: unknown) => v === true;

export const LEGACY_STATUS: Record<string, JobStatus> = {
  Pending: "new",
  Inspection: "new",
  Scheduled: "scheduled",
  "In Progress": "in_progress",
  Completed: "completed",
  Cancelled: "cancelled",
};

const METHOD: Record<string, PaymentMethod> = {
  Cash: "cash",
  "Bank Transfer": "bank",
  Cheque: "cheque",
};

/** Settings from legacy `config/general`, on top of this system's defaults. */
export function mapLegacySettings(config: Raw): Settings {
  const s = structuredClone(DEFAULT_SETTINGS);
  const sizes = arr(config.tankSizes);
  if (sizes.length) {
    const taken: string[] = [];
    s.pricing.tankSizes = sizes.map((t) => {
      const label = str(t.label) || "Tank";
      const id = slugId(label, taken);
      taken.push(id);
      return {
        id,
        label,
        litres: parseInt(label, 10) || 0,
        price: toAmount(t.price),
        active: true,
      };
    });
  }
  if (toAmount(config.sumpRate) > 0) s.pricing.sumpRatePerCubicFt = toAmount(config.sumpRate);
  const locs = arr(config.locations);
  if (locs.length) {
    const taken: string[] = [];
    s.locations = locs.map((l) => {
      const name = str(l.name) || "Location";
      const id = slugId(name, taken);
      taken.push(id);
      return { id, name, fee: toAmount(l.fee), insideColombo: /colombo/i.test(name), active: true };
    });
  }
  const equipment = Array.isArray(config.equipment)
    ? config.equipment.map(str).filter((e) => e && e !== "Unassigned")
    : [];
  if (equipment.length) {
    const taken: string[] = [];
    s.equipment = equipment.map((name) => {
      const id = slugId(name, taken);
      taken.push(id);
      return { id, name, active: true };
    });
  }
  const terms = arr(config.terms);
  s.terms = terms.length
    ? terms.map((sec) => ({
        title: str(sec.section).replace(/^\d+\.\s*/, "") || "Terms",
        clauses: arr(sec.items).map((i) => ({
          title: str(i.title).replace(/:$/, ""),
          text: str(i.text),
        })),
      }))
    : DEFAULT_TERMS;
  return s;
}

/** Staff named on legacy orders and in the legacy roster, as directory entries without sign-in. */
export function mapLegacyStaff(config: Raw, orders: Raw[], now: string): StaffMember[] {
  const roles = new Map<string, Set<"supervisor" | "technician">>();
  const add = (name: string, role: "supervisor" | "technician") => {
    const n = name.trim();
    if (!n || n === "Unassigned") return;
    if (!roles.has(n)) roles.set(n, new Set());
    roles.get(n)!.add(role);
  };
  const roster = (config.staff ?? {}) as Raw;
  for (const n of Array.isArray(roster.supervisors) ? roster.supervisors : [])
    add(str(n), "supervisor");
  for (const n of Array.isArray(roster.technicians) ? roster.technicians : [])
    add(str(n), "technician");
  for (const o of orders) {
    add(str(o.supervisor), "supervisor");
    add(str(o.technician), "technician");
  }
  return [...roles].map(([name, r], i) => ({
    id: `legacy-${slugId(name, [])}`,
    name: name.replace(/\s*\(Lead\)$/i, ""),
    phone: "",
    crewRoles: [...r],
    active: true,
    login: null,
    color: ["#4ba7db", "#12345c", "#16a34a", "#d97706", "#7c3aed"][i % 5]!,
    createdAt: now,
    updatedAt: now,
  }));
}

export interface LegacyContext {
  settings: Settings;
  staffByName: Map<string, string>;
  now: string;
}

export interface MappedOrder {
  job: Job | null;
  inspection: Inspection | null;
  payments: Payment[];
  customerKey: string;
  customer: Omit<Customer, "id">;
}

const uid = (prefix: string, n: number) => `${prefix}${n.toString(36)}`;

/** One legacy order as a job (or an inspection), its payments and its customer. */
export function mapLegacyOrder(o: Raw, ctx: LegacyContext): MappedOrder {
  const id = str(o.id) || `TS-LEGACY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const created = str(o.createdAt) || ctx.now;
  const intake = str(o.intakeDate) || created.slice(0, 10);
  const phone = toE164(str(o.phone)) ?? str(o.phone);
  const loc = ctx.settings.locations.find((l) => l.name === str(o.location));
  const legacyStatus = str(o.status) || "Pending";
  const status = LEGACY_STATUS[legacyStatus] ?? "new";
  const sizes = ctx.settings.pricing.tankSizes;

  const typeText = str(o.type);
  const hasTank = o.hasTank === true || /tank/i.test(typeText);
  const hasSump = o.hasSump === true || /sump/i.test(typeText);
  const tanks: TankItem[] = hasTank
    ? arr(o.tankDetails).map((t, n) => {
        const custom = bool(t.isCustom);
        const size = custom ? undefined : sizes.find((s) => s.label === str(t.size));
        return {
          id: uid("t", n),
          sizeId: size?.id ?? null,
          label: custom ? str(t.customSize) || "Custom" : str(t.size) || "Tank",
          litres: size?.litres ?? (parseInt(str(t.customSize), 10) || 0),
          price: custom ? toAmount(t.customPrice) : (size?.price ?? 0),
        };
      })
    : [];
  const rate =
    toAmount(o.customSumpRate) > 0
      ? toAmount(o.customSumpRate)
      : ctx.settings.pricing.sumpRatePerCubicFt;
  const sumps: SumpItem[] = hasSump
    ? arr(o.sumpDimensions).map((d, n) => ({
        id: uid("s", n),
        length: toAmount(d.length),
        breadth: toAmount(d.breadth),
        height: toAmount(d.height),
        rate,
      }))
    : [];

  const addOns = arr(o.customAddOns)
    .filter((a) => str(a.name) || toAmount(a.price))
    .map((a, n) => ({ id: uid("a", n), name: str(a.name), price: toAmount(a.price) }));
  const base = {
    tanks,
    sumps,
    transportFee: toAmount(o.deliveryFee),
    ladderNeeded: bool(o.needsLadder),
    ladderFee: toAmount(o.ladderPrice),
    addOns,
    discount: toAmount(o.discount),
  };
  // The legacy app could edit line items on the invoice preview, so its stored
  // total can differ from a re-priced one. Keep the stored amount exact.
  const storedSubtotal = toAmount(o.subtotal) || toAmount(o.total) + toAmount(o.discount);
  const repriced = priceSummary(base);
  const gap = roundMoney(storedSubtotal - repriced.subtotal);
  if (storedSubtotal > 0 && Math.abs(gap) >= 1) {
    if (gap > 0) addOns.push({ id: "legacy-adj", name: "Adjustment (legacy invoice)", price: gap });
    else base.discount = roundMoney(base.discount - gap);
  }
  const priced = priceSummary(base);

  const payments: Payment[] = arr(o.payments).map((p, n) => ({
    id: `legacy-${id}-${n}`,
    jobId: id,
    customerId: "",
    customerName: str(o.name),
    amount: toAmount(p.amount),
    method: METHOD[str(p.method)] ?? "cash",
    date: str(p.date) || intake,
    reference: "",
    note: "Imported from the legacy app",
    receivedBy: "",
    createdAt: ctx.now,
    createdBy: "legacy-import",
    voided: false,
    voidReason: "",
    voidedAt: null,
  }));
  const method = str(o.paymentMethod);
  if (!payments.length && status === "completed" && METHOD[method]) {
    payments.push({
      ...{
        id: `legacy-${id}-0`,
        jobId: id,
        customerId: "",
        customerName: str(o.name),
        reference: "",
      },
      amount: priced.total,
      method: METHOD[method]!,
      date: (str(o.completedAt) || str(o.date) || intake).slice(0, 10),
      note: "Recorded as paid in the legacy app",
      receivedBy: "",
      createdAt: ctx.now,
      createdBy: "legacy-import",
      voided: false,
      voidReason: "",
      voidedAt: null,
    });
  }
  const paid = roundMoney(payments.reduce((s, p) => s + p.amount, 0));
  const staffId = (name: unknown) => ctx.staffByName.get(str(name)) ?? "";
  const equipmentId = ctx.settings.equipment.find((e) => e.name === str(o.equipment))?.id;

  const customer: Omit<Customer, "id"> = {
    name: str(o.name) || "Unknown",
    phone,
    phoneKey: phoneKey(phone),
    altPhone: "",
    email: "",
    type: "residential",
    sites: str(o.address)
      ? [
          {
            id: "site-1",
            label: "Home",
            address: str(o.address),
            locationId: loc?.id ?? "",
            accessNotes: "",
          },
        ]
      : [],
    notes: "",
    marketingConsent: false,
    createdAt: created,
    updatedAt: ctx.now,
    lastServiceDate: null,
    nextDueDate: null,
    isDeleted: false,
  };
  if (status === "completed") {
    const served = (str(o.endDate) || str(o.date) || str(o.completedAt)).slice(0, 10);
    if (served) {
      customer.lastServiceDate = served;
      customer.nextDueDate = addMonths(served, ctx.settings.reminders.recleanMonths);
    }
  }

  const isInspection = bool(o.isInspection) && legacyStatus === "Inspection";
  const inspection: Inspection | null =
    bool(o.isInspection) || bool(o.needsInspection)
      ? {
          id: `IN-${id.replace(/^TS-/, "")}`,
          type: (["Tank", "Sump", "Cleaning"].includes(str(o.inspectionType))
            ? str(o.inspectionType).toLowerCase()
            : "tank") as InspectionType,
          status: isInspection ? "scheduled" : status === "new" ? "scheduled" : "completed",
          jobId: isInspection ? "" : id,
          customerId: "",
          customerName: customer.name,
          phone,
          address: str(o.address),
          locationName: str(o.location),
          date: str(o.inspectionDate) || str(o.date) || intake,
          time: str(o.inspectionTime) || str(o.time),
          inspectorId: staffId(o.supervisor),
          findings: {
            ...DEFAULT_FINDINGS,
            outerTank: bool(o.hasOuterTank),
            ladderRequired: bool(o.ladderRequired),
            siteSafe: o.siteSafe !== false,
            electricityAccess: o.electricityAccess !== false,
            properAccess: o.hasSumpAccess !== false,
            waterLevel: (["full", "half", "low", "empty"].includes(str(o.waterLevel).toLowerCase())
              ? str(o.waterLevel).toLowerCase()
              : "") as Inspection["findings"]["waterLevel"],
            category:
              str(o.cleaningCategory).toLowerCase() === "commercial" ? "commercial" : "residential",
            multiStorey: bool(o.isMultiStory),
            floorAreaSqft: toAmount(o.floorArea),
            bedrooms: toAmount(o.bedroomCount),
            bathrooms: toAmount(o.bathroomCount),
          },
          tanks,
          sumps,
          observations: str(o.inspectionComments),
          recommendations: "",
          appliedToJobAt: null,
          createdAt: created,
          createdBy: "legacy-import",
          updatedAt: ctx.now,
          completedAt: null,
        }
      : null;

  const job: Job | null = isInspection
    ? null
    : {
        id,
        status,
        source: "other",
        customerId: "",
        customerName: customer.name,
        phone,
        altPhone: "",
        address: str(o.address),
        locationId: loc?.id ?? "",
        locationName: str(o.location),
        insideColombo: loc?.insideColombo ?? /colombo/i.test(str(o.location)),
        ...base,
        subtotal: priced.subtotal,
        total: priced.total,
        date: str(o.date),
        endDate: str(o.endDate),
        time: str(o.time),
        inspectionNeeded: bool(o.needsInspection) && status === "new",
        supervisorId: staffId(o.supervisor),
        technicianIds: staffId(o.technician) ? [staffId(o.technician)] : [],
        equipmentIds: equipmentId ? [equipmentId] : [],
        notes: [str(o.note), typeText ? `Legacy service: ${typeText}` : ""]
          .filter(Boolean)
          .join("\n"),
        cancelReason: str(o.cancelReason),
        createdAt: created,
        createdBy: "legacy-import",
        updatedAt: ctx.now,
        updatedBy: "legacy-import",
        intakeDate: intake,
        quotedAt: null,
        startedAt: null,
        completedAt:
          status === "completed"
            ? str(o.completedAt) || `${str(o.date) || intake}T12:00:00.000Z`
            : null,
        cancelledAt: status === "cancelled" ? str(o.updatedAt) || created : null,
        isDeleted: bool(o.isDeleted),
        deletedAt: str(o.deletedAt) || null,
        paidAmount: paid,
        paymentStatus: paymentStatusFor(priced.total, paid),
        expenses: arr(o.expenseBreakdown).map((e) => ({
          category: str(e.category),
          amount: toAmount(e.amount),
        })),
        expenseTotal: toAmount(o.expenses),
        profit: roundMoney(priced.total - toAmount(o.expenses)),
      };

  return {
    job,
    inspection,
    payments,
    customerKey: customer.phoneKey || `name:${customer.name.toLowerCase()}`,
    customer,
  };
}

export const legacyImportDate = () => isoDate();
