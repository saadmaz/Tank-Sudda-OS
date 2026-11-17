// Site inspections: a supervisor visits before the work, checks access and
// safety, and measures the tanks and sumps so the job can be priced exactly.
// Covers the legacy app's tank, sump and cleaning checklists. Pure.

import type { SumpItem, TankItem } from "./pricing";

export type InspectionType = "tank" | "sump" | "cleaning";
export type InspectionStatus = "scheduled" | "completed" | "cancelled";

export const INSPECTION_TYPES: { value: InspectionType; label: string }[] = [
  { value: "tank", label: "Overhead tank" },
  { value: "sump", label: "Underground sump" },
  { value: "cleaning", label: "Premises cleaning" },
];

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type Level = "" | "low" | "medium" | "high";
export type Condition = "" | "good" | "fair" | "poor";

export interface Findings {
  siteSafe: boolean;
  electricityAccess: boolean;
  waterSupplyCanBeShut: boolean;
  outerTank: boolean;
  ladderRequired: boolean;
  tankMaterial: "" | "plastic" | "concrete" | "steel" | "other";
  accessHeightFt: number;
  properAccess: boolean;
  waterLevel: "" | "full" | "half" | "low" | "empty";
  sediment: Level;
  condition: Condition;
  fittingsCondition: Condition;
  category: "residential" | "commercial";
  multiStorey: boolean;
  floorAreaSqft: number;
  bedrooms: number;
  bathrooms: number;
  cleaningType: "standard" | "deep" | "move-in" | "post-construction";
}

export interface Inspection {
  /** IN-YYMMDD-XXXX, also the document id. */
  id: string;
  type: InspectionType;
  status: InspectionStatus;
  /** The lead or job this inspection prices, if any. */
  jobId: string;
  customerId: string;
  customerName: string;
  phone: string;
  address: string;
  locationName: string;
  date: string;
  time: string;
  inspectorId: string;
  findings: Findings;
  /** Measured on site; can be applied to the job's pricing. */
  tanks: TankItem[];
  sumps: SumpItem[];
  observations: string;
  recommendations: string;
  appliedToJobAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  completedAt: string | null;
}

export const DEFAULT_FINDINGS: Findings = {
  siteSafe: true,
  electricityAccess: true,
  waterSupplyCanBeShut: true,
  outerTank: false,
  ladderRequired: false,
  tankMaterial: "",
  accessHeightFt: 0,
  properAccess: true,
  waterLevel: "",
  sediment: "",
  condition: "",
  fittingsCondition: "",
  category: "residential",
  multiStorey: false,
  floorAreaSqft: 0,
  bedrooms: 0,
  bathrooms: 0,
  cleaningType: "standard",
};

export function normalizeFindings(f: Partial<Findings> | undefined): Findings {
  return { ...DEFAULT_FINDINGS, ...(f ?? {}) };
}

const yes = (b: boolean) => (b ? "Yes" : "No");
const cap = (s: string) =>
  s ? s[0]!.toUpperCase() + s.slice(1).replace(/-/g, " ") : "Not recorded";

/** Label/value rows for the screen summary and the report. */
export function findingRows(i: Pick<Inspection, "type" | "findings">): [string, string][] {
  const f = normalizeFindings(i.findings);
  const shared: [string, string][] = [
    ["Site safe to work", yes(f.siteSafe)],
    ["Electricity point available", yes(f.electricityAccess)],
  ];
  if (i.type === "tank")
    return [
      ...shared,
      ["Water supply can be shut off", yes(f.waterSupplyCanBeShut)],
      ["Outer tank present", yes(f.outerTank)],
      ["Ladder required", yes(f.ladderRequired)],
      ["Access height", f.accessHeightFt ? `${f.accessHeightFt} ft` : "Not recorded"],
      ["Tank material", cap(f.tankMaterial)],
      ["Sediment", cap(f.sediment)],
      ["Tank condition", cap(f.condition)],
      ["Valves and fittings", cap(f.fittingsCondition)],
    ];
  if (i.type === "sump")
    return [
      ...shared,
      ["Proper access to the sump", yes(f.properAccess)],
      ["Water level", cap(f.waterLevel)],
      ["Sediment", cap(f.sediment)],
      ["Sump condition", cap(f.condition)],
      ["Valves and fittings", cap(f.fittingsCondition)],
    ];
  return [
    ...shared,
    ["Category", cap(f.category)],
    ["Storeys", f.multiStorey ? "Multi-storey" : "Single storey"],
    ["Floor area", f.floorAreaSqft ? `${f.floorAreaSqft} sq ft` : "Not recorded"],
    ["Bedrooms / bathrooms", `${f.bedrooms} / ${f.bathrooms}`],
    ["Cleaning type", cap(f.cleaningType)],
  ];
}

/** What the office should know before quoting. */
export function inspectionWarnings(i: Pick<Inspection, "type" | "findings">): string[] {
  const f = normalizeFindings(i.findings);
  const w: string[] = [];
  if (!f.siteSafe) w.push("Site not safe to work");
  if (!f.electricityAccess) w.push("No electricity point: bring a generator");
  if (i.type === "tank" && f.ladderRequired) w.push("Ladder required");
  if (i.type === "tank" && !f.waterSupplyCanBeShut) w.push("Water supply can't be shut off");
  if (i.type === "sump" && !f.properAccess) w.push("Restricted sump access");
  if (f.sediment === "high") w.push("Heavy sediment: allow extra time");
  if (f.fittingsCondition === "poor") w.push("Fittings in poor condition: warn the customer");
  return w;
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newInspectionRef(now = new Date(), random: () => number = Math.random): string {
  const y = String(now.getFullYear()).slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  let s = "";
  for (let k = 0; k < 4; k++) s += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)];
  return `IN-${y}${m}${d}-${s}`;
}
