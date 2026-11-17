import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, activeTankSizes, normalizeSettings, slugId } from "./settings";

describe("normalizeSettings", () => {
  it("returns defaults for an empty or missing document", () => {
    expect(normalizeSettings(undefined)).toEqual({
      ...DEFAULT_SETTINGS,
      updatedAt: undefined,
      updatedBy: undefined,
    });
    expect(normalizeSettings({}).pricing.sumpRatePerCubicFt).toBe(2500);
  });

  it("keeps stored values and fills missing fields", () => {
    const s = normalizeSettings({
      company: { name: "TS", phone: 7 },
      pricing: { sumpRatePerCubicFt: 3000 },
    });
    expect(s.company.name).toBe("TS");
    expect(s.company.phone).toBe(DEFAULT_SETTINGS.company.phone);
    expect(s.company.email).toBe(DEFAULT_SETTINGS.company.email);
    expect(s.pricing.sumpRatePerCubicFt).toBe(3000);
    expect(s.pricing.tankSizes).toHaveLength(5);
  });

  it("drops malformed list entries", () => {
    const s = normalizeSettings({
      locations: [{ id: "a", name: "A", fee: 100 }, { name: "broken" }, null],
    });
    expect(s.locations).toEqual([
      { id: "a", name: "A", fee: 100, insideColombo: false, active: true },
    ]);
  });

  it("lets an empty stored list stay empty", () => {
    expect(normalizeSettings({ equipment: [] }).equipment).toEqual([]);
  });
});

describe("helpers", () => {
  it("makes unique slugs", () => {
    expect(slugId("Vacuum 04", [])).toBe("vacuum-04");
    expect(slugId("Vacuum 04", ["vacuum-04"])).toBe("vacuum-04-2");
    expect(slugId("!!!", [])).toBe("item");
  });

  it("sorts active tank sizes by capacity", () => {
    const s = normalizeSettings({
      pricing: {
        tankSizes: [
          { id: "b", label: "2000L", litres: 2000, price: 1 },
          { id: "a", label: "500L", litres: 500, price: 1 },
          { id: "c", label: "Old", litres: 100, price: 1, active: false },
        ],
      },
    });
    expect(activeTankSizes(s).map((t) => t.id)).toEqual(["a", "b"]);
  });
});
