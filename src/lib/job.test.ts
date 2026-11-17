import { describe, expect, it } from "vitest";
import {
  bySchedule,
  canMove,
  filterJobs,
  isoDate,
  jobDays,
  jobSummaryText,
  newJobRef,
  scheduleLabel,
  statusStamps,
  withTotals,
} from "./job";
import { makeJob } from "./test-fixtures";
import { addMonths, findByPhone, searchCustomers, type Customer } from "./customer";

describe("references and dates", () => {
  it("builds a dated reference", () => {
    expect(newJobRef(new Date(2026, 10, 18), () => 0)).toBe("TS-261118-AAAA");
    expect(newJobRef()).toMatch(/^TS-\d{6}-[A-Z2-9]{4}$/);
  });

  it("uses the local calendar date", () => {
    expect(isoDate(new Date(2026, 0, 5, 1, 0))).toBe("2026-01-05");
  });

  it("lists every day of a multi-day job", () => {
    expect(jobDays({ date: "2026-11-29", endDate: "2026-12-02" })).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(jobDays({ date: "2026-11-29", endDate: "" })).toEqual(["2026-11-29"]);
    expect(jobDays({ date: "", endDate: "" })).toEqual([]);
  });

  it("labels a schedule", () => {
    expect(scheduleLabel({ date: "", endDate: "", time: "" })).toBe("Not scheduled");
    expect(scheduleLabel({ date: "2026-11-29", endDate: "2026-11-30", time: "09:00" })).toBe(
      "29 Nov – 30 Nov, 09:00",
    );
  });
});

describe("status", () => {
  it("allows only legal moves", () => {
    expect(canMove("new", "scheduled")).toBe(true);
    expect(canMove("new", "completed")).toBe(false);
    expect(canMove("completed", "cancelled")).toBe(false);
    expect(canMove("cancelled", "new")).toBe(true);
    expect(canMove("quoted", "quoted")).toBe(true);
  });

  it("stamps the matching timestamp", () => {
    expect(statusStamps("completed", "T")).toEqual({ completedAt: "T" });
    expect(statusStamps("scheduled", "T")).toEqual({});
  });
});

describe("totals and text", () => {
  it("recomputes totals from the work", () => {
    const j = withTotals({ ...makeJob(), discount: 500, subtotal: 0, total: 0 });
    expect(j.subtotal).toBe(9500);
    expect(j.total).toBe(9000);
  });

  it("writes a WhatsApp job sheet", () => {
    const text = jobSummaryText(makeJob(), { supervisor: "Saman", technicians: ["Kamal"] });
    expect(text).toContain("*Ref:* TS-261118-AAAA");
    expect(text).toContain("*Contact:* 077 123 4567");
    expect(text).toContain("*Supervisor:* Saman");
    expect(text).toContain("*Total:* LKR 9,500");
  });
});

describe("filtering", () => {
  const jobs = [
    makeJob({ id: "TS-1", customerName: "Amal", insideColombo: true }),
    makeJob({ id: "TS-2", customerName: "Bimal", insideColombo: false, status: "scheduled" }),
    makeJob({ id: "TS-3", customerName: "Chamal", isDeleted: true }),
  ];
  const base = { query: "", status: "all" as const, area: "all" as const, trash: false };

  it("separates the trash", () => {
    expect(filterJobs(jobs, base).map((j) => j.id)).toEqual(["TS-1", "TS-2"]);
    expect(filterJobs(jobs, { ...base, trash: true }).map((j) => j.id)).toEqual(["TS-3"]);
  });

  it("filters by area, status and search", () => {
    expect(filterJobs(jobs, { ...base, area: "outside" }).map((j) => j.id)).toEqual(["TS-2"]);
    expect(filterJobs(jobs, { ...base, status: "scheduled" }).map((j) => j.id)).toEqual(["TS-2"]);
    expect(filterJobs(jobs, { ...base, query: "bim" }).map((j) => j.id)).toEqual(["TS-2"]);
    expect(filterJobs(jobs, { ...base, query: "1234" })).toHaveLength(2);
  });

  it("sorts unscheduled jobs last", () => {
    const a = makeJob({ id: "a", date: "" });
    const b = makeJob({ id: "b", date: "2026-12-01", time: "09:00" });
    expect([a, b].sort(bySchedule).map((j) => j.id)).toEqual(["b", "a"]);
  });
});

describe("customers", () => {
  const c = (over: Partial<Customer>): Customer => ({
    id: "c",
    name: "Name",
    phone: "",
    phoneKey: "",
    altPhone: "",
    email: "",
    type: "residential",
    sites: [],
    notes: "",
    marketingConsent: false,
    createdAt: "",
    updatedAt: "",
    lastServiceDate: null,
    nextDueDate: null,
    isDeleted: false,
    ...over,
  });
  const list = [
    c({ id: "1", name: "Nimal Perera", phone: "+94771234567", phoneKey: "+94771234567" }),
    c({ id: "2", name: "Kamal Silva", phone: "+94711111111", phoneKey: "+94711111111" }),
    c({ id: "3", name: "Nimali", isDeleted: true }),
  ];

  it("searches by name and phone, skipping deleted", () => {
    expect(searchCustomers(list, "nim").map((x) => x.id)).toEqual(["1"]);
    expect(searchCustomers(list, "0771234").map((x) => x.id)).toEqual(["1"]);
    expect(searchCustomers(list, "n")).toEqual([]);
  });

  it("matches the same number typed differently", () => {
    expect(findByPhone(list, "077 123 4567")?.id).toBe("1");
    expect(findByPhone(list, "0700000000")).toBeUndefined();
  });

  it("adds months, clamping short months", () => {
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
  });
});
