// Pricing engine for tank and sump cleaning. Pure and unit-tested: the job
// editor, documents and reports all price a job through these functions, so a
// quote, an invoice and a report can never disagree.
//
// Prices are captured on the job when an item is added (`price` on a tank,
// `rate` on a sump), so changing prices in Settings never alters an existing
// quote.

import { roundMoney, sumMoney, toAmount } from "./currency";

export interface TankItem {
  id: string;
  /** Settings tank size id, or null for a custom size. */
  sizeId: string | null;
  label: string;
  litres: number;
  price: number;
}

export interface SumpItem {
  id: string;
  /** Feet. */
  length: number;
  breadth: number;
  height: number;
  /** LKR per cubic foot at the time it was added. */
  rate: number;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
}

export interface PricedWork {
  tanks: TankItem[];
  sumps: SumpItem[];
  transportFee: number;
  ladderNeeded: boolean;
  ladderFee: number;
  addOns: AddOn[];
  discount: number;
}

export interface PriceLine {
  kind: "tank" | "sump" | "transport" | "ladder" | "addon";
  title: string;
  detail: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface PriceSummary {
  lines: PriceLine[];
  subtotal: number;
  discount: number;
  total: number;
}

/** Cubic feet, rounded to two decimals. */
export function sumpVolume(s: Pick<SumpItem, "length" | "breadth" | "height">): number {
  return roundMoney(toAmount(s.length) * toAmount(s.breadth) * toAmount(s.height));
}

export function sumpPrice(s: SumpItem): number {
  return roundMoney(sumpVolume(s) * toAmount(s.rate));
}

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, ""));

/** Every chargeable line, grouped so identical tanks print as one line with a quantity. */
export function priceLines(work: PricedWork): PriceLine[] {
  const lines: PriceLine[] = [];

  const groups = new Map<string, { label: string; price: number; qty: number }>();
  for (const t of work.tanks) {
    const key = `${t.label}|${toAmount(t.price)}`;
    const g = groups.get(key);
    if (g) g.qty++;
    else groups.set(key, { label: t.label, price: toAmount(t.price), qty: 1 });
  }
  for (const g of groups.values()) {
    lines.push({
      kind: "tank",
      title: "Overhead tank cleaning",
      detail: g.label,
      qty: g.qty,
      unitPrice: g.price,
      amount: roundMoney(g.price * g.qty),
    });
  }

  work.sumps.forEach((s, i) => {
    const vol = sumpVolume(s);
    lines.push({
      kind: "sump",
      title: work.sumps.length > 1 ? `Underground sump ${i + 1}` : "Underground sump cleaning",
      detail: `${n(toAmount(s.length))} × ${n(toAmount(s.breadth))} × ${n(toAmount(s.height))} ft = ${n(vol)} ft³ at ${n(toAmount(s.rate))}/ft³`,
      qty: 1,
      unitPrice: sumpPrice(s),
      amount: sumpPrice(s),
    });
  });

  if (toAmount(work.transportFee) > 0) {
    lines.push({
      kind: "transport",
      title: "Transport",
      detail: "",
      qty: 1,
      unitPrice: toAmount(work.transportFee),
      amount: roundMoney(toAmount(work.transportFee)),
    });
  }

  if (work.ladderNeeded && toAmount(work.ladderFee) > 0) {
    lines.push({
      kind: "ladder",
      title: "Ladder",
      detail: "Extended-height access",
      qty: 1,
      unitPrice: toAmount(work.ladderFee),
      amount: roundMoney(toAmount(work.ladderFee)),
    });
  }

  for (const a of work.addOns) {
    if (!a.name.trim() && !toAmount(a.price)) continue;
    lines.push({
      kind: "addon",
      title: a.name.trim() || "Additional item",
      detail: "",
      qty: 1,
      unitPrice: toAmount(a.price),
      amount: roundMoney(toAmount(a.price)),
    });
  }

  return lines;
}

/** Subtotal, discount (never more than the subtotal) and total. */
export function priceSummary(work: PricedWork): PriceSummary {
  const lines = priceLines(work);
  const subtotal = sumMoney(lines.map((l) => l.amount));
  const discount = Math.min(Math.max(0, roundMoney(toAmount(work.discount))), subtotal);
  return { lines, subtotal, discount, total: roundMoney(subtotal - discount) };
}

/** Short description of the work, e.g. "2 × 1000L tank + sump". */
export function describeWork(work: Pick<PricedWork, "tanks" | "sumps">): string {
  const parts: string[] = [];
  const counts = new Map<string, number>();
  for (const t of work.tanks) counts.set(t.label, (counts.get(t.label) ?? 0) + 1);
  const tankParts = [...counts].map(([label, c]) => (c > 1 ? `${c} × ${label}` : label));
  if (tankParts.length)
    parts.push(`${tankParts.join(", ")} tank${work.tanks.length > 1 ? "s" : ""}`);
  if (work.sumps.length) parts.push(work.sumps.length > 1 ? `${work.sumps.length} sumps` : "sump");
  return parts.join(" + ") || "No work added";
}

/** Advance payment requested before work begins. */
export function advanceAmount(total: number, percent: number): number {
  return roundMoney((toAmount(total) * Math.min(100, Math.max(0, toAmount(percent)))) / 100);
}
