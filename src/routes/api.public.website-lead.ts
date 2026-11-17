import { createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { WebsiteLeadSchema, leadPhoneKey, matchLocation, websiteLeadToJob } from "@/lib/intake";
import { newSiteId, type Customer } from "@/lib/customer";
import { normalizeSettings } from "@/lib/settings";
import { createRateLimiter } from "@/server/rate-limit";

// Receives leads from tanksudda.com. The website's webhook channel posts
// `{ type, lead }` signed with HMAC-SHA256 in X-TankSudda-Signature
// ("sha256=<hex>") using the shared WEBSITE_WEBHOOK_SECRET. Server to server,
// so no CORS. Retries are safe: the job id comes from the lead's reference.

const isRateLimited = createRateLimiter(60 * 1000, 30);

function validSignature(body: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"), "utf8");
  const given = Buffer.from(header.slice(7), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/public/website-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WEBSITE_WEBHOOK_SECRET;
        if (!secret) return json({ ok: false, error: "not_configured" }, 503);
        if (isRateLimited(request.headers.get("x-forwarded-for") ?? "unknown")) {
          return json({ ok: false, error: "rate_limited" }, 429);
        }

        const body = await request.text();
        if (body.length > 64_000) return json({ ok: false, error: "too_large" }, 413);
        if (!validSignature(body, request.headers.get("x-tanksudda-signature"), secret)) {
          return json({ ok: false, error: "bad_signature" }, 401);
        }

        let parsed;
        try {
          parsed = WebsiteLeadSchema.parse(JSON.parse(body));
        } catch {
          return json({ ok: false, error: "invalid" }, 400);
        }
        const lead = parsed.lead;

        try {
          const { adminDb } = await import("@/server/firebase-admin");
          const settings = normalizeSettings((await adminDb.doc("settings/general").get()).data());
          const town = lead.fields.find((f) => /^town|^area/i.test(f.label))?.value ?? "";
          const loc = matchLocation(town, settings.locations);
          const job = websiteLeadToJob(lead, loc);
          const jobRef = adminDb.collection("jobs").doc(job.id);
          const key = leadPhoneKey(lead);

          const created = await adminDb.runTransaction(async (tx) => {
            if ((await tx.get(jobRef)).exists) return false;
            const match = key
              ? await tx.get(adminDb.collection("customers").where("phoneKey", "==", key).limit(1))
              : null;
            const now = new Date().toISOString();
            if (match && !match.empty) {
              job.customerId = match.docs[0]!.id;
              job.source = "repeat";
              job.notes = `Repeat customer via the website.\n${job.notes}`;
            } else {
              const ref = adminDb.collection("customers").doc();
              job.customerId = ref.id;
              const customer: Customer = {
                id: ref.id,
                name: lead.contact.name,
                phone: job.phone,
                phoneKey: key,
                altPhone: "",
                email: lead.contact.email ?? "",
                type: "residential",
                sites: job.address
                  ? [
                      {
                        id: newSiteId(),
                        label: "Home",
                        address: job.address,
                        locationId: job.locationId,
                        accessNotes: "",
                      },
                    ]
                  : [],
                notes: "",
                marketingConsent: lead.marketingConsent,
                createdAt: now,
                updatedAt: now,
                lastServiceDate: null,
                nextDueDate: null,
                isDeleted: false,
              };
              tx.set(ref, customer);
            }
            tx.set(jobRef, job);
            tx.set(adminDb.collection("auditLog").doc(), {
              at: now,
              actorId: "website",
              actorName: "Website",
              action: "job.create",
              entity: "job",
              entityId: job.id,
              summary: `Website ${lead.kind} from ${lead.contact.name} (${lead.reference})`,
            });
            return true;
          });
          return json({ ok: true, id: job.id, duplicate: !created });
        } catch (err) {
          console.error("[website-lead] write failed:", err);
          return json({ ok: false, error: "unavailable" }, 500);
        }
      },
    },
  },
});
