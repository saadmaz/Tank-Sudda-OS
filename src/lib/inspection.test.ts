import { describe, expect, it } from "vitest";
import { findingRows, inspectionWarnings, newInspectionRef, normalizeFindings } from "./inspection";

describe("inspections", () => {
  it("fills missing findings with defaults", () => {
    expect(normalizeFindings({ siteSafe: false }).electricityAccess).toBe(true);
  });

  it("lists rows for each type", () => {
    const f = normalizeFindings({ ladderRequired: true, sediment: "high" });
    expect(findingRows({ type: "tank", findings: f })).toContainEqual(["Ladder required", "Yes"]);
    expect(findingRows({ type: "sump", findings: f })).toContainEqual(["Sediment", "High"]);
    expect(findingRows({ type: "cleaning", findings: f })).toContainEqual([
      "Cleaning type",
      "Standard",
    ]);
  });

  it("warns about risks", () => {
    const f = normalizeFindings({ siteSafe: false, ladderRequired: true, sediment: "high" });
    expect(inspectionWarnings({ type: "tank", findings: f })).toEqual([
      "Site not safe to work",
      "Ladder required",
      "Heavy sediment: allow extra time",
    ]);
    expect(inspectionWarnings({ type: "sump", findings: normalizeFindings({}) })).toEqual([]);
  });

  it("builds a dated reference", () => {
    expect(newInspectionRef(new Date(2026, 10, 18), () => 0)).toBe("IN-261118-AAAA");
  });
});
