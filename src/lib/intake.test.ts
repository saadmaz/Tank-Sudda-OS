import { describe, expect, it } from "vitest";
import { WebsiteLeadSchema, matchLocation, websiteJobId, websiteLeadToJob } from "./intake";
import { fillTemplate, normalizeTemplates } from "./messages";
import { makeJob } from "./test-fixtures";

const payload = {
  type: "lead.booking",
  lead: {
    kind: "booking",
    reference: "TS-20261118-7K2QD",
    submittedAt: "2026-11-18T04:00:00.000Z",
    contact: { name: "Nadeesha Silva", phone: "077 555 1234", email: "n@example.com" },
    fields: [
      { label: "Service", value: "Water tank cleaning", shared: true },
      { label: "Approximate tank size", value: "1,000 – 2,500 litres", shared: true },
      { label: "Town", value: "Gampaha", shared: true },
      { label: "Address", value: "45 Temple Road" },
      { label: "Preferred date", value: "2026-11-25" },
    ],
    marketingConsent: true,
  },
};

describe("website intake", () => {
  it("validates the website's payload", () => {
    expect(WebsiteLeadSchema.safeParse(payload).success).toBe(true);
    expect(WebsiteLeadSchema.safeParse({ ...payload, type: "other" }).success).toBe(false);
  });

  it("maps a booking to a new lead", () => {
    const lead = WebsiteLeadSchema.parse(payload).lead;
    const j = websiteLeadToJob(lead, {
      id: "gampaha",
      name: "Gampaha",
      fee: 2500,
      insideColombo: false,
    });
    expect(j.id).toBe("TS-WEB-TS-20261118-7K2QD");
    expect(j).toMatchObject({
      status: "new",
      source: "website",
      phone: "+94775551234",
      address: "45 Temple Road, Gampaha",
      locationId: "gampaha",
      transportFee: 2500,
      total: 2500,
      inspectionNeeded: true,
      intakeDate: "2026-11-18",
    });
    expect(j.notes).toContain("Preferred date: 2026-11-25");
    expect(j.notes).toContain("Email: n@example.com");
  });

  it("matches a town to a location", () => {
    const locs = [
      { name: "Colombo 1-15", active: true },
      { name: "Gampaha", active: true },
      { name: "Kandy", active: false },
    ];
    expect(matchLocation("Gampaha", locs)?.name).toBe("Gampaha");
    expect(matchLocation("colombo", locs)?.name).toBe("Colombo 1-15");
    expect(matchLocation("Kandy", locs)).toBeNull();
    expect(matchLocation("", locs)).toBeNull();
  });

  it("makes stable ids", () => {
    expect(websiteJobId("ab/c d")).toBe("TS-WEB-ABCD");
  });
});

describe("message templates", () => {
  it("fills placeholders", () => {
    const text = fillTemplate(
      "Hi {name}, {ref} is {total}, balance {balance}. {company} {unknown}",
      {
        name: "Nimal Perera",
        company: "Tank Sudda",
        phone: "",
        job: makeJob({ total: 9500, paidAmount: 4500 }),
      },
    );
    expect(text).toBe(
      "Hi Nimal, TS-261118-AAAA is LKR 9,500, balance LKR 5,000. Tank Sudda {unknown}",
    );
  });

  it("keeps stored text and adds new defaults", () => {
    const t = normalizeTemplates([{ key: "review", text: "Custom" }]);
    expect(t.find((x) => x.key === "review")?.text).toBe("Custom");
    expect(t).toHaveLength(5);
  });
});
