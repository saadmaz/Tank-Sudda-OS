// Money helpers. All amounts are Sri Lankan rupees held as plain numbers in
// whole rupees or with cents; every sum is rounded to cents to avoid float drift.

const lkrFormatter = new Intl.NumberFormat("en-LK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const lkrFixedFormatter = new Intl.NumberFormat("en-LK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Rounds to the nearest cent. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Coerces form input ("", "1,500", undefined) to a finite number, never NaN. */
export function toAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** "LKR 12,500" — for screens. */
export function formatLKR(value: number): string {
  return `LKR ${lkrFormatter.format(roundMoney(value))}`;
}

/** "12,500.00" — for documents, where columns must line up. */
export function formatAmount(value: number): string {
  return lkrFixedFormatter.format(roundMoney(value));
}

/** Sums a list of amounts, rounding once at the end. */
export function sumMoney(values: readonly number[]): number {
  return roundMoney(values.reduce((total, v) => total + toAmount(v), 0));
}
