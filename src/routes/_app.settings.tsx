import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { collection, limit, orderBy, query, setDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { formatLKR, toAmount } from "@/lib/currency";
import { storage } from "@/lib/firebase";
import { DEFAULT_TERMS, slugId, type Settings } from "@/lib/settings";
import { settingsRef, useLiveQuery, useStore } from "@/lib/store";
import { DEFAULT_TEMPLATES, PLACEHOLDERS } from "@/lib/messages";
import type { AuditEntry } from "@/lib/audit";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const TABS = [
  { key: "company", label: "Company" },
  { key: "pricing", label: "Pricing" },
  { key: "locations", label: "Locations" },
  { key: "equipment", label: "Equipment" },
  { key: "terms", label: "Terms" },
  { key: "documents", label: "Documents & targets" },
  { key: "messages", label: "Messages" },
  { key: "activity", label: "Activity" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function SettingsPage() {
  const { settings } = useStore();
  const { session } = useAuth();
  const [tab, setTab] = useState<TabKey>("company");
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(stripMeta(draft)) !== JSON.stringify(stripMeta(settings)),
    [draft, settings],
  );

  // Take remote changes while nothing is being edited here.
  useEffect(() => {
    if (!dirty) setDraft(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(settingsRef(), {
        ...stripMeta(draft),
        updatedAt: new Date().toISOString(),
        updatedBy: session?.staffId ?? "",
      });
      logAudit({
        action: "settings.update",
        entity: "settings",
        entityId: "general",
        summary: `Updated ${TABS.find((t) => t.key === tab)?.label.toLowerCase()} settings`,
      });
      toast.success("Settings saved");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save. You may not have permission to change settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-28 sm:p-6 sm:pb-28">
      <PageHeader
        title="Settings"
        description="Prices, locations, equipment, documents and company details."
      />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-9 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
                tab === t.key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "company" && <CompanyTab draft={draft} update={update} />}
      {tab === "pricing" && <PricingTab draft={draft} update={update} />}
      {tab === "locations" && <LocationsTab draft={draft} update={update} />}
      {tab === "equipment" && <EquipmentTab draft={draft} update={update} />}
      {tab === "terms" && <TermsTab draft={draft} update={update} />}
      {tab === "documents" && <DocumentsTab draft={draft} update={update} />}
      {tab === "messages" && <MessagesTab draft={draft} update={update} />}
      {tab === "activity" && <ActivityTab />}

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm font-medium">You have unsaved changes</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraft(settings)} disabled={saving}>
                Discard
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stripMeta(s: Settings) {
  const { updatedAt: _a, updatedBy: _b, ...rest } = s;
  return rest;
}

type TabProps = {
  draft: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input
        id={id}
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

// ── Company ──────────────────────────────────────────────────────────────────

function CompanyTab({ draft, update }: TabProps) {
  const c = draft.company;
  const set = (k: keyof Settings["company"], v: string) => update("company", { ...c, [k]: v });
  const b = draft.bank;
  const setBank = (k: keyof Settings["bank"], v: string) => update("bank", { ...b, [k]: v });
  const [uploading, setUploading] = useState(false);

  const uploadLogo = async (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      toast.error("Choose an image under 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const r = storageRef(storage, `branding/logo-${Date.now()}.${ext}`);
      await uploadBytes(r, file, { contentType: file.type });
      set("logoUrl", await getDownloadURL(r));
      toast.success("Logo uploaded. Save to use it.");
    } catch {
      toast.error("Couldn't upload the logo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Company" description="Shown on quotes, invoices and reports.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Trading name" value={c.name} onChange={(v) => set("name", v)} />
          <TextField label="Legal name" value={c.legalName} onChange={(v) => set("legalName", v)} />
          <TextField label="Tagline" value={c.tagline} onChange={(v) => set("tagline", v)} />
          <TextField
            label="Registration number"
            value={c.registrationNo}
            onChange={(v) => set("registrationNo", v)}
          />
          <TextField label="Phone" value={c.phone} onChange={(v) => set("phone", v)} />
          <TextField label="WhatsApp" value={c.whatsapp} onChange={(v) => set("whatsapp", v)} />
          <TextField label="Email" value={c.email} onChange={(v) => set("email", v)} />
          <TextField label="Website" value={c.website} onChange={(v) => set("website", v)} />
          <Field label="Address" htmlFor="f-address" className="sm:col-span-2">
            <Textarea
              id="f-address"
              rows={2}
              value={c.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-4 rounded-lg border p-3">
          <img
            src={c.logoUrl || "/brand/logo-512.png"}
            alt="Company logo"
            className="h-14 w-14 rounded-md border bg-white object-contain"
          />
          <div className="flex-1">
            <p className="text-sm font-medium">Logo</p>
            <p className="text-xs text-muted-foreground">
              PNG or JPG under 2 MB, used on documents.
            </p>
          </div>
          <Button variant="outline" asChild disabled={uploading}>
            <label className="cursor-pointer">
              <Upload /> {uploading ? "Uploading…" : "Upload"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadLogo(f);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        </div>
      </Section>

      <Section title="Bank account" description="Printed on invoices for bank transfers.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Account name"
            value={b.accountName}
            onChange={(v) => setBank("accountName", v)}
          />
          <TextField
            label="Account number"
            value={b.accountNumber}
            onChange={(v) => setBank("accountNumber", v)}
          />
          <TextField label="Bank" value={b.bankName} onChange={(v) => setBank("bankName", v)} />
          <TextField label="Branch" value={b.branch} onChange={(v) => setBank("branch", v)} />
        </div>
      </Section>
    </div>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────

function PricingTab({ draft, update }: TabProps) {
  const p = draft.pricing;
  const sizes = p.tankSizes;
  const setSizes = (tankSizes: Settings["pricing"]["tankSizes"]) =>
    update("pricing", { ...p, tankSizes });

  return (
    <div className="space-y-4">
      <Section
        title="Overhead tanks"
        description="Price per tank by size. Inactive sizes stay on old jobs but can't be chosen."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSizes([
                ...sizes,
                {
                  id: slugId(
                    "new-size",
                    sizes.map((s) => s.id),
                  ),
                  label: "New size",
                  litres: 0,
                  price: 0,
                  active: true,
                },
              ])
            }
          >
            <Plus /> Add size
          </Button>
        }
      >
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_7rem_8rem_3rem_2.75rem] gap-2 px-1 text-xs font-semibold text-muted-foreground sm:grid">
            <span>Label</span>
            <span>Litres</span>
            <span>Price (LKR)</span>
            <span>Active</span>
            <span />
          </div>
          {sizes.map((s, i) => (
            <div
              key={s.id}
              className="grid grid-cols-2 items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_7rem_8rem_3rem_2.75rem] sm:border-0 sm:p-0"
            >
              <Input
                aria-label="Label"
                value={s.label}
                className="col-span-2 sm:col-span-1"
                onChange={(e) =>
                  setSizes(sizes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <Input
                aria-label="Litres"
                type="number"
                inputMode="numeric"
                value={s.litres}
                onChange={(e) =>
                  setSizes(
                    sizes.map((x, j) => (j === i ? { ...x, litres: toAmount(e.target.value) } : x)),
                  )
                }
              />
              <Input
                aria-label="Price"
                type="number"
                inputMode="decimal"
                value={s.price}
                onChange={(e) =>
                  setSizes(
                    sizes.map((x, j) => (j === i ? { ...x, price: toAmount(e.target.value) } : x)),
                  )
                }
              />
              <Switch
                label={`${s.label} active`}
                checked={s.active}
                onCheckedChange={(active) =>
                  setSizes(sizes.map((x, j) => (j === i ? { ...x, active } : x)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${s.label}`}
                onClick={() => setSizes(sizes.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Sumps and add-ons">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField
            label="Sump rate per ft³ (LKR)"
            type="number"
            value={p.sumpRatePerCubicFt}
            onChange={(v) => update("pricing", { ...p, sumpRatePerCubicFt: toAmount(v) })}
            hint="Length × breadth × height in feet, times this rate."
          />
          <TextField
            label="Ladder fee (LKR)"
            type="number"
            value={p.ladderFee}
            onChange={(v) => update("pricing", { ...p, ladderFee: toAmount(v) })}
            hint="Default; can be changed on each job."
          />
          <TextField
            label="Advance payment (%)"
            type="number"
            value={p.advancePercent}
            onChange={(v) =>
              update("pricing", { ...p, advancePercent: Math.min(100, Math.max(0, toAmount(v))) })
            }
            hint="Requested before work begins."
          />
        </div>
      </Section>
    </div>
  );
}

// ── Locations ────────────────────────────────────────────────────────────────

function LocationsTab({ draft, update }: TabProps) {
  const locs = draft.locations;
  const set = (locations: Settings["locations"]) => update("locations", locations);

  return (
    <Section
      title="Service locations"
      description="Each location adds its transport fee to a job."
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            set([
              ...locs,
              {
                id: slugId(
                  "new-location",
                  locs.map((l) => l.id),
                ),
                name: "New location",
                fee: 0,
                insideColombo: false,
                active: true,
              },
            ])
          }
        >
          <Plus /> Add location
        </Button>
      }
    >
      <div className="space-y-2">
        {locs.map((l, i) => (
          <div
            key={l.id}
            className="grid grid-cols-2 items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_8rem_auto_auto_2.75rem]"
          >
            <Input
              aria-label="Location name"
              value={l.name}
              className="col-span-2 sm:col-span-1"
              onChange={(e) =>
                set(locs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
            />
            <Input
              aria-label="Transport fee"
              type="number"
              inputMode="decimal"
              value={l.fee}
              onChange={(e) =>
                set(locs.map((x, j) => (j === i ? { ...x, fee: toAmount(e.target.value) } : x)))
              }
            />
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={l.insideColombo}
                onChange={(e) =>
                  set(locs.map((x, j) => (j === i ? { ...x, insideColombo: e.target.checked } : x)))
                }
              />
              Inside Colombo
            </label>
            <Switch
              label={`${l.name} active`}
              checked={l.active}
              onCheckedChange={(active) =>
                set(locs.map((x, j) => (j === i ? { ...x, active } : x)))
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${l.name}`}
              onClick={() => set(locs.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">
          Lowest fee: {formatLKR(Math.min(...locs.map((l) => l.fee), 0))} · Highest:{" "}
          {formatLKR(Math.max(...locs.map((l) => l.fee), 0))}
        </p>
      </div>
    </Section>
  );
}

// ── Equipment ────────────────────────────────────────────────────────────────

function EquipmentTab({ draft, update }: TabProps) {
  const eq = draft.equipment;
  const [name, setName] = useState("");
  const add = () => {
    const n = name.trim();
    if (!n) return;
    update("equipment", [
      ...eq,
      {
        id: slugId(
          n,
          eq.map((e) => e.id),
        ),
        name: n,
        active: true,
      },
    ]);
    setName("");
  };

  return (
    <Section title="Equipment" description="Vacuums, pumps and machines assigned to jobs.">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          aria-label="New equipment name"
          placeholder="e.g. Vacuum 04"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>
      <div className="space-y-2">
        {eq.map((e, i) => (
          <div key={e.id} className="flex items-center gap-2 rounded-lg border p-2">
            <Input
              aria-label="Equipment name"
              value={e.name}
              onChange={(ev) =>
                update(
                  "equipment",
                  eq.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)),
                )
              }
            />
            <Switch
              label={`${e.name} active`}
              checked={e.active}
              onCheckedChange={(active) =>
                update(
                  "equipment",
                  eq.map((x, j) => (j === i ? { ...x, active } : x)),
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${e.name}`}
              onClick={() =>
                update(
                  "equipment",
                  eq.filter((_, j) => j !== i),
                )
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Terms ────────────────────────────────────────────────────────────────────

function TermsTab({ draft, update }: TabProps) {
  const terms = draft.terms;
  const set = (t: Settings["terms"]) => update("terms", t);

  return (
    <Section
      title="Terms and conditions"
      description="Printed on every quote, in this order."
      action={
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => set(DEFAULT_TERMS)}>
            <RotateCcw /> Defaults
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => set([...terms, { title: "New section", clauses: [] }])}
          >
            <Plus /> Section
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {terms.map((sec, si) => (
          <div key={si} className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">{si + 1}.</span>
              <Input
                aria-label="Section title"
                value={sec.title}
                className="font-semibold"
                onChange={(e) =>
                  set(terms.map((s, j) => (j === si ? { ...s, title: e.target.value } : s)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove section ${sec.title}`}
                onClick={() => set(terms.filter((_, j) => j !== si))}
              >
                <Trash2 />
              </Button>
            </div>
            {sec.clauses.map((cl, ci) => {
              const setClause = (patch: Partial<typeof cl>) =>
                set(
                  terms.map((s, j) =>
                    j === si
                      ? {
                          ...s,
                          clauses: s.clauses.map((c, k) => (k === ci ? { ...c, ...patch } : c)),
                        }
                      : s,
                  ),
                );
              return (
                <div key={ci} className="space-y-2 rounded-md border bg-card p-2 sm:ml-6">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Clause title"
                      value={cl.title}
                      onChange={(e) => setClause({ title: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove clause ${cl.title}`}
                      onClick={() =>
                        set(
                          terms.map((s, j) =>
                            j === si ? { ...s, clauses: s.clauses.filter((_, k) => k !== ci) } : s,
                          ),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <Textarea
                    aria-label="Clause text"
                    rows={2}
                    value={cl.text}
                    onChange={(e) => setClause({ text: e.target.value })}
                  />
                </div>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="sm:ml-6"
              onClick={() =>
                set(
                  terms.map((s, j) =>
                    j === si ? { ...s, clauses: [...s.clauses, { title: "", text: "" }] } : s,
                  ),
                )
              }
            >
              <Plus /> Clause
            </Button>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Documents and targets ────────────────────────────────────────────────────

function DocumentsTab({ draft, update }: TabProps) {
  const d = draft.documents;
  const setDoc_ = (k: keyof Settings["documents"], v: string) =>
    update("documents", { ...d, [k]: Math.max(0, Math.round(toAmount(v))) });

  return (
    <div className="space-y-4">
      <Section title="Targets">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Monthly revenue target (LKR)"
            type="number"
            value={draft.targets.monthlyRevenue}
            onChange={(v) => update("targets", { monthlyRevenue: toAmount(v) })}
            hint={`About ${formatLKR(draft.targets.monthlyRevenue / 4)} a week.`}
          />
          <TextField
            label="Re-clean reminder (months)"
            type="number"
            value={draft.reminders.recleanMonths}
            onChange={(v) =>
              update("reminders", { recleanMonths: Math.max(1, Math.round(toAmount(v))) })
            }
            hint="When a customer is due for their next cleaning."
          />
        </div>
      </Section>
      <Section title="Quotes and invoices">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Quote valid for (days)"
            type="number"
            value={d.quoteValidityDays}
            onChange={(v) => setDoc_("quoteValidityDays", v)}
          />
          <TextField
            label="Invoice due after (days)"
            type="number"
            value={d.invoiceDueDays}
            onChange={(v) => setDoc_("invoiceDueDays", v)}
          />
          <TextField
            label="Next quote number"
            type="number"
            value={d.nextQuoteNumber}
            onChange={(v) => setDoc_("nextQuoteNumber", v)}
            hint="Numbers are issued in order, e.g. Q-1001."
          />
          <TextField
            label="Next invoice number"
            type="number"
            value={d.nextInvoiceNumber}
            onChange={(v) => setDoc_("nextInvoiceNumber", v)}
            hint="e.g. INV-1001."
          />
        </div>
      </Section>
    </div>
  );
}

// ── Messages ─────────────────────────────────────────────────────────────────

function MessagesTab({ draft, update }: TabProps) {
  const msgs = draft.messages;
  return (
    <Section
      title="WhatsApp messages"
      description="Pre-written messages offered by the WhatsApp button on jobs and customers."
      action={
        <Button variant="ghost" size="sm" onClick={() => update("messages", DEFAULT_TEMPLATES)}>
          <RotateCcw /> Defaults
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {PLACEHOLDERS.map(([p, label]) => (
          <span key={p} className="rounded-md bg-muted px-2 py-1">
            <code className="font-semibold">{p}</code> {label}
          </span>
        ))}
      </div>
      <div className="space-y-4">
        {msgs.map((m, i) => (
          <Field key={m.key} label={m.label} htmlFor={`msg-${m.key}`}>
            <Textarea
              id={`msg-${m.key}`}
              rows={3}
              value={m.text}
              onChange={(e) =>
                update(
                  "messages",
                  msgs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                )
              }
            />
          </Field>
        ))}
      </div>
    </Section>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────

const ACTIVITY_QUERY = () => query(collection(db, "auditLog"), orderBy("at", "desc"), limit(150));

function ActivityTab() {
  const q = useMemo(ACTIVITY_QUERY, []);
  const { data, ready } = useLiveQuery<AuditEntry>(q);
  return (
    <Section
      title="Activity"
      description="The latest 150 changes, newest first. Entries can't be edited."
    >
      {!ready ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
              <span className="w-36 shrink-0 text-xs tabular-nums text-muted-foreground">
                {new Date(e.at).toLocaleString("en-GB")}
              </span>
              <span className="w-28 shrink-0 truncate text-xs font-semibold">
                {e.actorName || e.actorId}
              </span>
              <span className="min-w-0 flex-1">{e.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
