import { describe, expect, it } from "vitest";
import { conflictsFor, eventsByDay, findConflicts, monthGrid, weekOf } from "./schedule";
import { makeJob } from "./test-fixtures";

describe("calendar", () => {
  it("spreads a multi-day job across its days", () => {
    const j = makeJob({ status: "scheduled", date: "2026-11-30", endDate: "2026-12-02" });
    const days = eventsByDay([j], [], "2026-11-01", "2026-12-31");
    expect([...days.keys()]).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(days.get("2026-11-30")![0]!.span).toBe("start");
    expect(days.get("2026-12-01")![0]!.span).toBe("middle");
    expect(days.get("2026-12-02")![0]!.span).toBe("end");
  });

  it("skips deleted and unscheduled jobs, and clips to the range", () => {
    const days = eventsByDay(
      [
        makeJob({ date: "" }),
        makeJob({ date: "2026-11-20", isDeleted: true }),
        makeJob({ date: "2027-01-01" }),
      ],
      [],
      "2026-11-01",
      "2026-11-30",
    );
    expect(days.size).toBe(0);
  });

  it("builds Monday-first month grids", () => {
    const g = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(g[0]![0]).toBe("2026-10-26");
    expect(g[0]![6]).toBe("2026-11-01");
    expect(g.at(-1)!.at(-1)! >= "2026-11-30").toBe(true);
    expect(weekOf("2026-11-18")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });
});

describe("conflicts", () => {
  const a = makeJob({
    id: "TS-A",
    status: "scheduled",
    date: "2026-11-25",
    supervisorId: "sup",
    equipmentIds: ["vac1"],
  });
  const b = makeJob({
    id: "TS-B",
    status: "scheduled",
    date: "2026-11-24",
    endDate: "2026-11-26",
    technicianIds: ["sup"],
    equipmentIds: ["vac1"],
  });

  it("finds the same person and machine on two jobs on one day", () => {
    const c = findConflicts([a, b]);
    expect(c.map((x) => [x.date, x.kind, x.resourceId])).toEqual([
      ["2026-11-25", "staff", "sup"],
      ["2026-11-25", "equipment", "vac1"],
    ]);
  });

  it("ignores completed, cancelled and deleted jobs", () => {
    expect(findConflicts([a, { ...b, status: "completed" }])).toEqual([]);
    expect(findConflicts([a, { ...b, isDeleted: true }])).toEqual([]);
  });

  it("checks a draft against the rest, ignoring itself", () => {
    expect(conflictsFor(a, [a, b], "TS-A")).toHaveLength(2);
    expect(conflictsFor({ ...a, date: "2026-12-10" }, [a, b], "TS-A")).toEqual([]);
  });
});
