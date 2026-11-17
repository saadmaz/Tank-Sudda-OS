// Leads sent by the Tank Sudda website (Tank-Sudda-Website-TypeScript, its
// webhook channel in src/server/notifications/channels.ts). Pure: the route in
// src/routes/api.public.website-lead.ts verifies the signature and writes.

import { z } from "zod";
import { isoDate, type Job } from "./job";
import { phoneKey, toE164 } from "./phone";

/** The website's `Lead` shape, as posted: `{ type: "lead.booking" | "lead.contact", lead }`. */
export const WebsiteLeadSchema = z.object({
  type: z.enum(["lead.booking", "lead.contact"]),
  lead: z.object({
    kind: z.enum(["booking", "contact"]),
    reference: z.string().trim().min(3).max(64),
    submittedAt: z.string().min(10).max(40),
    contact: z.object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().max(32).nullable(),
      email: z.string().trim().max(200).nullable(),
    }),
    fields: z
      .array(
        z.object({
          label: z.string().max(80),
          value: z.string().max(2000),
          shared: z.boolean().optional(),
        }),
      )
      .max(40),
    marketingConsent: z.boolean(),
  }),
});

export type WebsiteLead = z.infer<typeof WebsiteLeadSchema>["lead"];

/** Job id for a website lead: stable, so a retried webhook never duplicates it. */
export const websiteJobId = (reference: string) =>
  `TS-WEB-${reference
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 40)
    .toUpperCase()}`;

const field = (lead: WebsiteLead, ...labels: string[]) =>
  lead.fields.find((f) => labels.some((l) => f.label.toLowerCase().startsWith(l.toLowerCase())))
    ?.value ?? "";

/** The job a website lead becomes, before the customer is matched. */
export function websiteLeadToJob(
  lead: WebsiteLead,
  location: { id: string; name: string; fee: number; insideColombo: boolean } | null,
): Job {
  const submitted = new Date(lead.submittedAt);
  const ts = Number.isNaN(submitted.getTime()) ? new Date().toISOString() : submitted.toISOString();
  const phone = lead.contact.phone ? (toE164(lead.contact.phone) ?? lead.contact.phone) : "";
  const town = field(lead, "Town", "Area");
  const address = [field(lead, "Address"), town].filter(Boolean).join(", ");
  const details = lead.fields.map((f) => `${f.label}: ${f.value}`).join("\n");
  const service = field(lead, "Service").toLowerCase();
  return {
    id: websiteJobId(lead.reference),
    status: "new",
    source: "website",
    customerId: "",
    customerName: lead.contact.name,
    phone,
    altPhone: "",
    address,
    locationId: location?.id ?? "",
    locationName: location?.name ?? town,
    insideColombo: location?.insideColombo ?? false,
    tanks: [],
    sumps: [],
    transportFee: location?.fee ?? 0,
    ladderNeeded: false,
    ladderFee: 0,
    addOns: [],
    discount: 0,
    subtotal: location?.fee ?? 0,
    total: location?.fee ?? 0,
    date: "",
    endDate: "",
    time: "",
    inspectionNeeded: lead.kind === "booking",
    supervisorId: "",
    technicianIds: [],
    equipmentIds: [],
    notes: [
      `Website ${lead.kind === "booking" ? "booking request" : "enquiry"} ${lead.reference}`,
      lead.contact.email ? `Email: ${lead.contact.email}` : "",
      service ? `Requested: ${field(lead, "Service")}` : "",
      details,
    ]
      .filter(Boolean)
      .join("\n"),
    cancelReason: "",
    createdAt: ts,
    createdBy: "website",
    updatedAt: ts,
    updatedBy: "website",
    intakeDate: isoDate(new Date(ts)),
    quotedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    isDeleted: false,
    deletedAt: null,
    paidAmount: 0,
    paymentStatus: "unpaid",
  };
}

/** Best location for a town name: exact or partial match on the location's name. */
export function matchLocation<T extends { name: string; active: boolean }>(
  town: string,
  locations: readonly T[],
): T | null {
  const t = town.trim().toLowerCase();
  if (!t) return null;
  const active = locations.filter((l) => l.active);
  return (
    active.find((l) => l.name.toLowerCase() === t) ??
    active.find(
      (l) => l.name.toLowerCase().includes(t) || t.includes(l.name.toLowerCase().split(" ")[0]!),
    ) ??
    null
  );
}

export const leadPhoneKey = (lead: WebsiteLead) =>
  lead.contact.phone ? phoneKey(lead.contact.phone) : "";
