import { describe, expect, it } from "vitest";
import {
  advanceAmount,
  describeWork,
  priceLines,
  priceSummary,
  sumpPrice,
  sumpVolume,
  type PricedWork,
} from "./pricing";

const empty: PricedWork = {
  tanks: [],
  sumps: [],
  transportFee: 0,
  ladderNeeded: false,
  ladderFee: 0,
  addOns: [],
  discount: 0,
};

const tank = (id: string, label: string, price: number) => ({
  id,
  sizeId: label.toLowerCase(),
  label,
  litres: parseInt(label, 10) || 0,
  price,
});

describe("sumps", () => {
  it("prices by volume and the captured rate", () => {
    const s = { id: "s", length: 10, breadth: 8, height: 5, rate: 2500 };
    expect(sumpVolume(s)).toBe(400);
    expect(sumpPrice(s)).toBe(1_000_000);
  });

  it("handles fractional feet", () => {
    expect(sumpVolume({ length: 4.5, breadth: 3, height: 2.25 })).toBe(30.38);
  });
});

describe("priceSummary", () => {
  it("matches the legacy app's total for a typical job", () => {
    // Legacy: two 1000L tanks (8,500 each), Colombo transport 1,000, ladder 1,500.
    const work: PricedWork = {
      ...empty,
      tanks: [tank("a", "1000L", 8500), tank("b", "1000L", 8500)],
      transportFee: 1000,
      ladderNeeded: true,
      ladderFee: 1500,
    };
    const s = priceSummary(work);
    expect(s.subtotal).toBe(19500);
    expect(s.total).toBe(19500);
    expect(s.lines.map((l) => [l.kind, l.qty, l.amount])).toEqual([
      ["tank", 2, 17000],
      ["transport", 1, 1000],
      ["ladder", 1, 1500],
    ]);
  });

  it("caps the discount at the subtotal", () => {
    const s = priceSummary({ ...empty, tanks: [tank("a", "500L", 5000)], discount: 9000 });
    expect(s.discount).toBe(5000);
    expect(s.total).toBe(0);
  });

  it("ignores a ladder fee when no ladder is needed, and empty add-ons", () => {
    const lines = priceLines({
      ...empty,
      ladderFee: 1500,
      addOns: [
        { id: "x", name: "", price: 0 },
        { id: "y", name: "Water tank lid", price: 2500 },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: "addon", title: "Water tank lid", amount: 2500 });
  });

  it("keeps differently priced tanks of the same size apart", () => {
    const lines = priceLines({
      ...empty,
      tanks: [tank("a", "1000L", 8500), tank("b", "1000L", 9000)],
    });
    expect(lines.map((l) => l.unitPrice)).toEqual([8500, 9000]);
  });
});

describe("describeWork", () => {
  it("summarises tanks and sumps", () => {
    expect(
      describeWork({
        tanks: [tank("a", "1000L", 1), tank("b", "1000L", 1), tank("c", "500L", 1)],
        sumps: [{ id: "s", length: 1, breadth: 1, height: 1, rate: 1 }],
      }),
    ).toBe("2 × 1000L, 500L tanks + sump");
    expect(describeWork({ tanks: [], sumps: [] })).toBe("No work added");
  });
});

describe("advanceAmount", () => {
  it("takes a bounded percentage", () => {
    expect(advanceAmount(19500, 50)).toBe(9750);
    expect(advanceAmount(1000, 150)).toBe(1000);
  });
});
