import { describe, expect, it } from "vitest";
import { mapLegacyOrder, mapLegacySettings, mapLegacyStaff } from "./legacy";

const config = {
  tankSizes: [
    { label: "500L", price: 5000 },
    { label: "1000L", price: 8500 },
  ],
  sumpRate: 2500,
  locations: [
    { name: "Colombo 1-15", fee: 1000 },
    { name: "Gampaha", fee: 2500 },
  ],
  equipment: ["Unassigned", "Vacuum 01"],
  staff: { supervisors: ["Unassigned", "Nimal (Lead)"], technicians: ["Unassigned", "Kamal"] },
  terms: [{ section: "1. Water Supply", items: [{ title: "Shut-off:", text: "Turn off." }] }],
};

const order = {
  id: "TS-4821",
  createdAt: "2026-03-01T05:00:00.000Z",
  intakeDate: "2026-03-01",
  name: "Sunil Perera",
  phone: "0771234567",
  address: "1 Lake Road",
  location: "Colombo 1-15",
  deliveryFee: 1000,
  type: "Tank (1000L, Custom: 1250L) + Sump Cleaning (4x3x2)",
  tankDetails: [
    { size: "1000L", isCustom: false },
    { size: "Custom", isCustom: true, customSize: "1250L", customPrice: "11000" },
  ],
  sumpDimensions: [{ length: "4", breadth: "3", height: "2" }],
  needsLadder: true,
  ladderPrice: "1500",
  customAddOns: [{ name: "Lid", price: "500" }],
  discount: 0,
  subtotal: 82500,
  total: 82500,
  date: "2026-03-05",
  time: "09:00",
  status: "Completed",
  completedAt: "2026-03-05T10:00:00.000Z",
  supervisor: "Nimal (Lead)",
  technician: "Kamal",
  equipment: "Vacuum 01",
  paymentMethod: "Cash",
  expenses: 2000,
  expenseBreakdown: [{ category: "Fuel", amount: 2000 }],
};

describe("legacy import", () => {
  const settings = mapLegacySettings(config);
  const staff = mapLegacyStaff(config, [order], "now");
  const ctx = {
    settings,
    staffByName: new Map([
      ["Nimal (Lead)", staff.find((s) => s.name === "Nimal")!.id],
      ["Kamal", staff.find((s) => s.name === "Kamal")!.id],
    ]),
    now: "2026-11-18T00:00:00.000Z",
  };

  it("maps settings", () => {
    expect(settings.pricing.tankSizes.map((t) => [t.id, t.price])).toEqual([
      ["500l", 5000],
      ["1000l", 8500],
    ]);
    expect(settings.locations[0]).toMatchObject({ id: "colombo-1-15", insideColombo: true });
    expect(settings.equipment).toEqual([{ id: "vacuum-01", name: "Vacuum 01", active: true }]);
    expect(settings.terms[0]).toEqual({
      title: "Water Supply",
      clauses: [{ title: "Shut-off", text: "Turn off." }],
    });
  });

  it("collects staff from the roster and orders", () => {
    expect(staff.map((s) => [s.name, s.crewRoles])).toEqual([
      ["Nimal", ["supervisor"]],
      ["Kamal", ["technician"]],
    ]);
  });

  it("maps a completed order with its work, crew and payment", () => {
    const m = mapLegacyOrder(order, ctx);
    const j = m.job!;
    expect(j.status).toBe("completed");
    expect(j.tanks.map((t) => [t.sizeId, t.label, t.price])).toEqual([
      ["1000l", "1000L", 8500],
      [null, "1250L", 11000],
    ]);
    expect(j.sumps[0]).toMatchObject({ length: 4, breadth: 3, height: 2, rate: 2500 });
    // 8,500 + 11,000 + 24 ft³ × 2,500 + 1,000 + 1,500 + 500 = 82,500
    expect(j.total).toBe(82500);
    expect(j.addOns.some((a) => a.id === "legacy-adj")).toBe(false);
    expect(j.supervisorId).toBe(ctx.staffByName.get("Nimal (Lead)"));
    expect(j.equipmentIds).toEqual(["vacuum-01"]);
    expect(m.payments).toHaveLength(1);
    expect(m.payments[0]).toMatchObject({ amount: 82500, method: "cash", date: "2026-03-05" });
    expect(j.paymentStatus).toBe("paid");
    expect(j.profit).toBe(80500);
    expect(m.customer).toMatchObject({ phoneKey: "+94771234567", nextDueDate: "2026-09-05" });
  });

  it("keeps an edited legacy total exact with an adjustment", () => {
    const j = mapLegacyOrder({ ...order, subtotal: 90000, total: 90000 }, ctx).job!;
    expect(j.total).toBe(90000);
    expect(j.addOns.find((a) => a.id === "legacy-adj")?.price).toBe(7500);
    const lower = mapLegacyOrder({ ...order, subtotal: 80000, total: 80000 }, ctx).job!;
    expect(lower.total).toBe(80000);
  });

  it("uses instalments when the legacy order had them", () => {
    const m = mapLegacyOrder(
      {
        ...order,
        payments: [
          { date: "2026-03-01", amount: 40000, method: "Bank Transfer" },
          { date: "2026-03-05", amount: 20000, method: "Cash" },
        ],
      },
      ctx,
    );
    expect(m.payments.map((p) => [p.method, p.amount])).toEqual([
      ["bank", 40000],
      ["cash", 20000],
    ]);
    expect(m.job!.paymentStatus).toBe("partial");
  });

  it("turns a legacy inspection record into an inspection only", () => {
    const m = mapLegacyOrder(
      {
        ...order,
        status: "Inspection",
        isInspection: true,
        inspectionType: "Sump",
        waterLevel: "Half",
      },
      ctx,
    );
    expect(m.job).toBeNull();
    expect(m.inspection).toMatchObject({ type: "sump", status: "scheduled" });
    expect(m.inspection!.findings.waterLevel).toBe("half");
  });
});
