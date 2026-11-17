import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { collection, query, where } from "firebase/firestore";
import { ArrowLeft, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { JobEditor } from "@/components/job-editor";
import { WhatsAppMenu } from "@/components/whatsapp-menu";
import { JobStatusBadge } from "@/components/job-status";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatLKR } from "@/lib/currency";
import { CUSTOMER_TYPES, newSiteId, type Customer } from "@/lib/customer";
import { saveCustomer } from "@/lib/db";
import { db } from "@/lib/firebase";
import { jobService, scheduleLabel, type Job } from "@/lib/job";
import { telLink, toE164, whatsappLink } from "@/lib/phone";
import { useLiveQuery, useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/customers/$customerId")({
  component: CustomerPage,
});

function CustomerPage() {
  const { customerId } = Route.useParams();
  const { customers } = useStore();
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <EmptyState
          title="Customer not found"
          action={
            <Button asChild variant="outline">
              <Link to="/customers">Back to customers</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <CustomerView customer={customer} />;
}

function CustomerView({ customer }: { customer: Customer }) {
  const { settings } = useStore();
  const [draft, setDraft] = useState(customer);
  // Shown as typed; saveCustomer stores the canonical +94 form.
  const [saving, setSaving] = useState(false);
  const [newJob, setNewJob] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(customer);

  useEffect(() => {
    if (!dirty) setDraft(customer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  // Every job for this customer, including ones older than the store's window.
  const historyQuery = useMemo(
    () => query(collection(db, "jobs"), where("customerId", "==", customer.id)),
    [customer.id],
  );
  const history = useLiveQuery<Job>(historyQuery);
  const jobs = history.data
    .filter((j) => !j.isDeleted)
    .sort((a, b) => b.intakeDate.localeCompare(a.intakeDate));
  const spent = jobs.filter((j) => j.status === "completed").reduce((s, j) => s + j.total, 0);

  const set = <K extends keyof Customer>(k: K, v: Customer[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const wa = whatsappLink(customer.phone);

  const save = async () => {
    if (!draft.name.trim()) return void toast.error("Enter a name.");
    if (!toE164(draft.phone) && draft.phone.replace(/\D/g, "").length < 6)
      return void toast.error("Enter a valid phone number.");
    setSaving(true);
    try {
      await saveCustomer(draft);
      toast.success("Customer saved");
    } catch {
      toast.error("Couldn't save the customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Link
            to="/customers"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Customers
          </Link>
          <h2 className="text-xl font-bold tracking-tight">{customer.name}</h2>
          <p className="text-sm text-muted-foreground">
            {jobs.length} job{jobs.length === 1 ? "" : "s"} · {formatLKR(spent)} completed work
            {customer.nextDueDate && ` · next cleaning due ${customer.nextDueDate}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={telLink(customer.phone)}>
              <Phone /> Call
            </a>
          </Button>
          {wa && (
            <WhatsAppMenu
              phone={customer.phone}
              name={customer.name}
              job={jobs.find((j) => j.status !== "cancelled")}
              only={["reminder", "review", "followUp", "payment"]}
            />
          )}
          <Button onClick={() => setNewJob(true)}>
            <Plus /> New lead
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Name" htmlFor="cu-name">
              <Input
                id="cu-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" htmlFor="cu-phone">
                <Input
                  id="cu-phone"
                  inputMode="tel"
                  value={draft.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="Second phone" htmlFor="cu-alt">
                <Input
                  id="cu-alt"
                  inputMode="tel"
                  value={draft.altPhone}
                  onChange={(e) => set("altPhone", e.target.value)}
                />
              </Field>
              <Field label="Email" htmlFor="cu-email">
                <Input
                  id="cu-email"
                  type="email"
                  value={draft.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field label="Type" htmlFor="cu-type">
                <Select
                  id="cu-type"
                  value={draft.type}
                  onChange={(e) => set("type", e.target.value as Customer["type"])}
                >
                  {CUSTOMER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Next cleaning due" htmlFor="cu-due">
                <Input
                  id="cu-due"
                  type="date"
                  value={draft.nextDueDate ?? ""}
                  onChange={(e) => set("nextDueDate", e.target.value || null)}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-2.5">
              <span className="text-sm">Agrees to reminders and offers</span>
              <Switch
                label="Agrees to reminders and offers"
                checked={draft.marketingConsent}
                onCheckedChange={(v) => set("marketingConsent", v)}
              />
            </div>
            <Field label="Notes" htmlFor="cu-notes">
              <Textarea
                id="cu-notes"
                rows={3}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Sites</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                set("sites", [
                  ...draft.sites,
                  {
                    id: newSiteId(),
                    label: `Site ${draft.sites.length + 1}`,
                    address: "",
                    locationId: settings.locations[0]?.id ?? "",
                    accessNotes: "",
                  },
                ])
              }
            >
              <Plus /> Site
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {draft.sites.length === 0 && (
              <p className="text-sm text-muted-foreground">No sites saved.</p>
            )}
            {draft.sites.map((s, i) => {
              const upd = (patch: Partial<typeof s>) =>
                set(
                  "sites",
                  draft.sites.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div key={s.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex gap-2">
                    <Input
                      aria-label="Site name"
                      value={s.label}
                      onChange={(e) => upd({ label: e.target.value })}
                    />
                    <Select
                      aria-label="Site location"
                      value={s.locationId}
                      onChange={(e) => upd({ locationId: e.target.value })}
                    >
                      {settings.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${s.label}`}
                      onClick={() =>
                        set(
                          "sites",
                          draft.sites.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <Textarea
                    aria-label="Site address"
                    rows={2}
                    placeholder="Address"
                    value={s.address}
                    onChange={(e) => upd({ address: e.target.value })}
                  />
                  <Input
                    aria-label="Access notes"
                    placeholder="Access notes for the crew: gate, tank location, parking"
                    value={s.accessNotes}
                    onChange={(e) => upd({ accessNotes: e.target.value })}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <ul className="divide-y">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId: j.id }}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm hover:text-primary"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{j.id}</span>
                    <span className="flex-1 truncate">{jobService(j)}</span>
                    <span className="text-xs text-muted-foreground">{scheduleLabel(j)}</span>
                    <JobStatusBadge status={j.status} />
                    <span className="w-24 text-right font-semibold tabular-nums">
                      {formatLKR(j.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm font-medium">Unsaved changes</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraft(customer)} disabled={saving}>
                Discard
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {newJob && <PrefilledEditor customer={customer} onClose={() => setNewJob(false)} />}
    </div>
  );
}

/** Opens the editor with this customer already chosen. */
function PrefilledEditor({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return <JobEditor key={customer.id} presetCustomer={customer} onClose={onClose} />;
}
