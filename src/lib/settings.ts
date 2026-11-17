// Business settings: one document, `settings/general`, edited under Settings
// and read by every screen. Defaults carry over the legacy app's values so a
// fresh project prices jobs exactly as before. Pure: no firebase/react imports.

export interface TankSize {
  id: string;
  label: string;
  /** Capacity in litres, used to sort and to match website requests. */
  litres: number;
  price: number;
  active: boolean;
}

export interface ServiceLocation {
  id: string;
  name: string;
  /** Transport fee added to every job at this location. */
  fee: number;
  /** Inside Colombo or not; drives the list filter and reports. */
  insideColombo: boolean;
  active: boolean;
}

export interface EquipmentItem {
  id: string;
  name: string;
  active: boolean;
}

export interface TermsClause {
  title: string;
  text: string;
}

export interface TermsSection {
  title: string;
  clauses: TermsClause[];
}

export interface Settings {
  company: {
    name: string;
    legalName: string;
    tagline: string;
    registrationNo: string;
    phone: string;
    whatsapp: string;
    email: string;
    website: string;
    address: string;
    logoUrl: string;
  };
  bank: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    branch: string;
  };
  pricing: {
    tankSizes: TankSize[];
    /** LKR per cubic foot of sump volume. */
    sumpRatePerCubicFt: number;
    /** Default charge when a ladder is needed; editable per job. */
    ladderFee: number;
    /** Share of the total asked for up front, in percent. */
    advancePercent: number;
  };
  locations: ServiceLocation[];
  equipment: EquipmentItem[];
  terms: TermsSection[];
  targets: {
    monthlyRevenue: number;
  };
  documents: {
    quoteValidityDays: number;
    invoiceDueDays: number;
    nextQuoteNumber: number;
    nextInvoiceNumber: number;
  };
  reminders: {
    /** Months after a completed cleaning before the next one is due. */
    recleanMonths: number;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_TERMS: TermsSection[] = [
  {
    title: "Water supply and preparation",
    clauses: [
      {
        title: "Pre-cleaning shut-off",
        text: "Water supply to the tanks must be turned off at least 24 hours before the scheduled cleaning. This minimises water wastage and keeps the cleaning efficient.",
      },
      {
        title: "Service interruption",
        text: "Water supply is shut off during cleaning, usually for about 4 to 5 hours. Normal supply resumes as soon as the work is complete.",
      },
    ],
  },
  {
    title: "Liability and structural integrity",
    clauses: [
      {
        title: "Existing fittings",
        text: "Tank Sudda is not responsible for damage arising from pre-existing wear and tear, including old, rusted or fragile components such as bolt valves, ball valves, foot valves or taps.",
      },
      {
        title: "Hidden defects",
        text: "Tank Sudda is not liable for leaks or structural failures that become apparent after removing sludge, silt or debris that may have been masking pre-existing cracks or corrosion.",
      },
    ],
  },
  {
    title: "Site access and requirements",
    clauses: [
      {
        title: "Access",
        text: "The client must provide safe and unobstructed access to the tank area.",
      },
      {
        title: "Utilities",
        text: "The client agrees to provide a working electricity point near the work site for the cleaning equipment, such as pressure washers and pumps.",
      },
    ],
  },
  {
    title: "Payment and cancellation",
    clauses: [
      {
        title: "Payment schedule",
        text: "A 50% advance payment is required before work begins. The remaining 50% is payable immediately on completion and handover.",
      },
      {
        title: "Cancellations",
        text: "Cancellations or rescheduling requested less than 24 hours before the appointment may forfeit the advance payment or incur a cancellation fee of 10% of the total order amount.",
      },
    ],
  },
];

export const DEFAULT_SETTINGS: Settings = {
  company: {
    name: "Tank Sudda",
    legalName: "Tank Sudda (Pvt) Ltd",
    tagline: "Professional tank and sump cleaning",
    registrationNo: "",
    phone: "+94 74 100 4296",
    whatsapp: "+94 74 100 4296",
    email: "info@tanksudda.com",
    website: "www.tanksudda.com",
    address: "",
    logoUrl: "/brand/logo-512.png",
  },
  bank: {
    accountName: "TANK SUDDA (PVT) LTD",
    accountNumber: "1001013167",
    bankName: "Commercial Bank",
    branch: "",
  },
  pricing: {
    tankSizes: [
      { id: "500l", label: "500L", litres: 500, price: 5000, active: true },
      { id: "1000l", label: "1000L", litres: 1000, price: 8500, active: true },
      { id: "2000l", label: "2000L", litres: 2000, price: 15000, active: true },
      { id: "5000l", label: "5000L", litres: 5000, price: 32000, active: true },
      { id: "10000l", label: "10000L", litres: 10000, price: 60000, active: true },
    ],
    sumpRatePerCubicFt: 2500,
    ladderFee: 1500,
    advancePercent: 50,
  },
  locations: [
    { id: "colombo", name: "Colombo 1-15", fee: 1000, insideColombo: true, active: true },
    { id: "gampaha", name: "Gampaha", fee: 2500, insideColombo: false, active: true },
    { id: "kalutara", name: "Kalutara", fee: 3500, insideColombo: false, active: true },
    { id: "kandy", name: "Kandy", fee: 8000, insideColombo: false, active: true },
    { id: "galle", name: "Galle", fee: 10000, insideColombo: false, active: true },
  ],
  equipment: [
    { id: "vacuum-01", name: "Vacuum 01", active: true },
    { id: "vacuum-02", name: "Vacuum 02", active: true },
    { id: "vacuum-03", name: "Vacuum 03", active: true },
  ],
  terms: DEFAULT_TERMS,
  targets: {
    // The legacy app tracked LKR 125,000 a week, shown as four weeks a month.
    monthlyRevenue: 500000,
  },
  documents: {
    quoteValidityDays: 14,
    invoiceDueDays: 7,
    nextQuoteNumber: 1001,
    nextInvoiceNumber: 1001,
  },
  reminders: {
    recleanMonths: 6,
  },
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

function mergeSection<T extends Record<string, unknown>>(defaults: T, stored: unknown): T {
  if (!isObj(stored)) return { ...defaults };
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, d] of Object.entries(defaults)) {
    const v = stored[k];
    out[k] = typeof d === "number" ? num(v, d) : typeof d === "string" ? str(v, d) : d;
  }
  return out as T;
}

function list<T>(stored: unknown, fallback: T[], valid: (x: unknown) => x is T): T[] {
  return Array.isArray(stored) ? stored.filter(valid) : fallback;
}

const isTankSize = (x: unknown): x is TankSize =>
  isObj(x) &&
  typeof x.id === "string" &&
  typeof x.label === "string" &&
  typeof x.price === "number";
const isLocation = (x: unknown): x is ServiceLocation =>
  isObj(x) && typeof x.id === "string" && typeof x.name === "string" && typeof x.fee === "number";
const isEquipment = (x: unknown): x is EquipmentItem =>
  isObj(x) && typeof x.id === "string" && typeof x.name === "string";
const isTermsSection = (x: unknown): x is TermsSection =>
  isObj(x) && typeof x.title === "string" && Array.isArray(x.clauses);

/**
 * Reads a stored settings document defensively: missing sections and fields
 * fall back to defaults, malformed list entries are dropped. The app never
 * crashes on a half-written or older settings document.
 */
export function normalizeSettings(stored: unknown): Settings {
  const s = isObj(stored) ? stored : {};
  const pricing = isObj(s.pricing) ? s.pricing : {};
  return {
    company: mergeSection(DEFAULT_SETTINGS.company, s.company),
    bank: mergeSection(DEFAULT_SETTINGS.bank, s.bank),
    pricing: {
      tankSizes: list(pricing.tankSizes, DEFAULT_SETTINGS.pricing.tankSizes, isTankSize).map(
        (t) => ({ ...t, litres: num(t.litres, 0), active: t.active !== false }),
      ),
      sumpRatePerCubicFt: num(
        pricing.sumpRatePerCubicFt,
        DEFAULT_SETTINGS.pricing.sumpRatePerCubicFt,
      ),
      ladderFee: num(pricing.ladderFee, DEFAULT_SETTINGS.pricing.ladderFee),
      advancePercent: num(pricing.advancePercent, DEFAULT_SETTINGS.pricing.advancePercent),
    },
    locations: list(s.locations, DEFAULT_SETTINGS.locations, isLocation).map((l) => ({
      ...l,
      insideColombo: l.insideColombo === true,
      active: l.active !== false,
    })),
    equipment: list(s.equipment, DEFAULT_SETTINGS.equipment, isEquipment).map((e) => ({
      ...e,
      active: e.active !== false,
    })),
    terms: list(s.terms, DEFAULT_SETTINGS.terms, isTermsSection),
    targets: mergeSection(DEFAULT_SETTINGS.targets, s.targets),
    documents: mergeSection(DEFAULT_SETTINGS.documents, s.documents),
    reminders: mergeSection(DEFAULT_SETTINGS.reminders, s.reminders),
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : undefined,
    updatedBy: typeof s.updatedBy === "string" ? s.updatedBy : undefined,
  };
}

/** A URL-safe id from a label, unique within `taken`. */
export function slugId(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

export const activeTankSizes = (s: Settings) =>
  [...s.pricing.tankSizes].filter((t) => t.active).sort((a, b) => a.litres - b.litres);

export const activeLocations = (s: Settings) => s.locations.filter((l) => l.active);

export const activeEquipment = (s: Settings) => s.equipment.filter((e) => e.active);
