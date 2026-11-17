import { describe, expect, it } from "vitest";
import { presetRange, rangeStats, serviceKind, toCSV } from "./reports";
import { makeJob } from "./test-fixtures";
import type { Payment } from "./billing";

const r = { from: "2026-11-01", to: "2026-11-30" };

describe("rangeStats", () => {
  const jobs = [
    makeJob({
      id: "a",
      intakeDate: "2026-11-02",
      status: "completed",
      completedAt: "2026-11-10T09:00:00Z",
      total: 9500,
      expenseTotal: 1500,
      source: "website",
    }),
    makeJob({
      id: "b",
      intakeDate: "2026-11-03",
      status: "completed",
      completedAt: "2026-11-10T12:00:00Z",
      total: 20000,
      locationName: "Gampaha",
    }),
    makeJob({
      id: "c",
      intakeDate: "2026-11-05",
      status: "cancelled",
      cancelledAt: "2026-11-06T00:00:00Z",
      cancelReason: "Price too high: wanted 5k",
    }),
    makeJob({ id: "d", intakeDate: "2026-11-20", status: "new" }),
    makeJob({
      id: "e",
      intakeDate: "2026-10-20",
      status: "completed",
      completedAt: "2026-10-25T00:00:00Z",
      total: 1,
    }),
    makeJob({ id: "f", intakeDate: "2026-11-20", isDeleted: true }),
  ];
  const payments = [
    { amount: 9500, method: "cash", date: "2026-11-10", voided: false },
    { amount: 10000, method: "bank", date: "2026-11-11", voided: false },
    { amount: 999, method: "cash", date: "2026-11-11", voided: true },
  ] as Payment[];
  const s = rangeStats(jobs, payments, ["2026-11-04", "2026-12-01"], r);

  it("counts the period", () => {
    expect([s.leads, s.completed, s.cancelled, s.inspections]).toEqual([4, 2, 1, 1]);
    expect(s.conversion).toBe(50);
  });

  it("totals money", () => {
    expect(s.revenue).toBe(29500);
    expect(s.expenses).toBe(1500);
    expect(s.profit).toBe(28000);
    expect(s.received).toBe(19500);
    expect(s.receivedByMethod).toEqual({ cash: 9500, bank: 10000 });
    expect(s.averageJob).toBe(14750);
  });

  it("breaks down by day, location, source and reason", () => {
    expect(s.daily).toEqual([{ date: "2026-11-10", revenue: 29500, count: 2 }]);
    expect(s.byLocation[0]).toMatchObject({ label: "Gampaha", revenue: 20000 });
    expect(s.bySource.find((b) => b.key === "website")?.label).toBe("Website");
    expect(s.cancelReasons).toEqual([
      { key: "Price too high", label: "Price too high", count: 1, revenue: 0 },
    ]);
  });
});

describe("helpers", () => {
  it("classifies the service", () => {
    expect(serviceKind(makeJob())).toBe("tank");
    expect(serviceKind(makeJob({ tanks: [], sumps: [] }))).toBe("none");
  });

  it("builds ranges", () => {
    const today = new Date(2026, 10, 18);
    expect(presetRange("month", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(presetRange("last-month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("week", today)).toEqual({ from: "2026-11-16", to: "2026-11-18" });
  });

  it("escapes CSV", () => {
    expect(toCSV([["a", 'say "hi"', "x,y", null, 3]])).toBe('a,"say ""hi""","x,y",,3');
  });
});
