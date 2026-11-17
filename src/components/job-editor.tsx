import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Minus, Plus, Trash2, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, Label } from "./ui/label";
import { Select } from "./ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { formatAmount, formatLKR, toAmount } from "@/lib/currency";
import { CUSTOMER_TYPES, findByPhone, searchCustomers, type Customer } from "@/lib/customer";
import { saveJob } from "@/lib/db";
import {
  JOB_SOURCES,
  JOB_TRANSITIONS,
  STATUS_LABEL,
  isoDate,
  type Job,
  type JobDraft,
  type JobStatus,
} from "@/lib/job";
import { formatPhone, toE164 } from "@/lib/phone";
import { priceSummary, sumpVolume, type SumpItem, type TankItem } from "@/lib/pricing";
import { activeEquipment, activeLocations, activeTankSizes } from "@/lib/settings";
import { crewFor } from "@/lib/staff";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const uid = () => Math.random().toString(36).slice(2, 9);

function emptyDraft(
  status: JobStatus,
  defaults: { locationId: string; locationName: string; fee: number; insideColombo: boolean },
): JobDraft {
  return {
    status,
    source: "phone",
    customerId: "",
    customerName: "",
    phone: "",
    altPhone: "",
    address: "",
    locationId: defaults.locationId,
    locationName: defaults.locationName,
    insideColombo: defaults.insideColombo,
    tanks: [],
    sumps: [],
    transportFee: defaults.fee,
    ladderNeeded: false,
    ladderFee: 0,
    addOns: [],
    discount: 0,
    date: "",
    endDate: "",
    time: "09:00",
    inspectionNeeded: false,
    supervisorId: "",
    technicianIds: [],
    equipmentIds: [],
    notes: "",
    cancelReason: "",
    intakeDate: isoDate(),
  };
}

function toDraft(j: Job): JobDraft {
  const {
    id: _id,
    subtotal: _s,
    total: _t,
    createdAt: _ca,
    createdBy: _cb,
    updatedAt: _ua,
    updatedBy: _ub,
    quotedAt: _q,
    startedAt: _st,
    completedAt: _co,
    cancelledAt: _cn,
    isDeleted: _d,
    deletedAt: _dd,
    ...draft
  } = j;
  return draft;
}

export function JobEditor({
  job,
  initialStatus = "new",
  presetCustomer,
  onClose,
  onSaved,
}: {
  job?: Job;
  initialStatus?: JobStatus;
  /** Starts a new lead for this customer. */
  presetCustomer?: Customer;
  onClose: () => void;
  onSaved?: (job: Job) => void;
}) {
  const { settings, customers, staff } = useStore();
  const locations = activeLocations(settings);
  const sizes = activeTankSizes(settings);
  const firstLoc = locations[0];

  const [draft, setDraft] = useState<JobDraft>(() =>
    job
      ? toDraft(job)
      : emptyDraft(initialStatus, {
          locationId: firstLoc?.id ?? "",
          locationName: firstLoc?.name ?? "",
          fee: firstLoc?.fee ?? 0,
          insideColombo: firstLoc?.insideColombo ?? false,
        }),
  );
  const [customer, setCustomer] = useState<Customer | null>(
    () => (job && customers.find((c) => c.id === job.customerId)) || null,
  );
  const [newType, setNewType] = useState<Customer["type"]>("residential");
  const [newEmail, setNewEmail] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const set = <K extends keyof JobDraft>(k: K, v: JobDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const summary = useMemo(() => priceSummary(draft), [draft]);

  const suggestions = useMemo(
    () => (customer ? [] : searchCustomers(customers, draft.customerName || draft.phone)),
    [customers, customer, draft.customerName, draft.phone],
  );
  const phoneMatch =
    !customer && toE164(draft.phone) ? findByPhone(customers, draft.phone) : undefined;

  const pickCustomer = (c: Customer) => {
    setCustomer(c);
    setSuggestOpen(false);
    const site = c.sites[0];
    const loc = settings.locations.find((l) => l.id === site?.locationId);
    setDraft((d) => ({
      ...d,
      customerId: c.id,
      customerName: c.name,
      phone: formatPhone(c.phone),
      altPhone: c.altPhone ? formatPhone(c.altPhone) : "",
      address: site?.address ?? d.address,
      ...(loc
        ? {
            locationId: loc.id,
            locationName: loc.name,
            insideColombo: loc.insideColombo,
            transportFee: loc.fee,
          }
        : {}),
      source: job ? d.source : "repeat",
    }));
  };

  useEffect(() => {
    if (presetCustomer && !job) pickCustomer(presetCustomer);
    // Run once when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocation = (id: string) => {
    const loc = settings.locations.find((l) => l.id === id);
    if (!loc) return;
    setDraft((d) => ({
      ...d,
      locationId: loc.id,
      locationName: loc.name,
      insideColombo: loc.insideColombo,
      transportFee: loc.fee,
    }));
  };

  const addTank = () => {
    const last = draft.tanks[draft.tanks.length - 1];
    const size = sizes.find((s) => s.litres === 1000) ?? sizes[0];
    const t: TankItem = last
      ? { ...last, id: uid() }
      : {
          id: uid(),
          sizeId: size?.id ?? null,
          label: size?.label ?? "Custom",
          litres: size?.litres ?? 0,
          price: size?.price ?? 0,
        };
    set("tanks", [...draft.tanks, t]);
  };

  const addSump = () =>
    set("sumps", [
      ...draft.sumps,
      { id: uid(), length: 0, breadth: 0, height: 0, rate: settings.pricing.sumpRatePerCubicFt },
    ]);

  const allowedStatuses: JobStatus[] = job
    ? [
        job.status,
        ...JOB_TRANSITIONS[job.status].filter((s) => s !== "cancelled" && s !== "completed"),
      ]
    : ["new", "quoted", "scheduled"];

  const errors = {
    customerName: !draft.customerName.trim() ? "Enter the customer's name." : undefined,
    phone:
      !toE164(draft.phone) && draft.phone.replace(/\D/g, "").length < 6
        ? "Enter a valid phone number."
        : undefined,
    date:
      (draft.status === "scheduled" || draft.status === "in_progress") && !draft.date
        ? "Choose the date for scheduled work."
        : undefined,
    endDate:
      draft.endDate && draft.date && draft.endDate < draft.date
        ? "Ends before it starts."
        : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const save = async () => {
    setTouched(true);
    if (!valid) {
      toast.error("Check the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveJob(
        { ...draft, discount: Math.min(toAmount(draft.discount), summary.subtotal) },
        customer ? { kind: "existing", customer } : { kind: "new", type: newType, email: newEmail },
        job,
      );
      toast.success(job ? "Saved" : `${saved.id} created`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save. Check your access and try again.");
    } finally {
      setSaving(false);
    }
  };

  const supervisors = crewFor(staff, "supervisor");
  const technicians = crewFor(staff, "technician");
  const equipment = activeEquipment(settings);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="border-b px-5 py-4">
          <SheetTitle>
            {job ? `Edit ${job.id}` : draft.status === "new" ? "New lead" : "New job"}
          </SheetTitle>
          <SheetDescription>
            Prices fill in from Settings and can be changed for this job.
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Customer */}
          <Block title="Customer">
            {customer ? (
              <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-accent/50 p-3">
                <UserCheck className="h-5 w-5 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Existing customer</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {customer.sites.length} site{customer.sites.length === 1 ? "" : "s"}
                    {customer.lastServiceDate && ` · last cleaned ${customer.lastServiceDate}`}
                  </p>
                </div>
                {!job && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCustomer(null);
                      set("customerId", "");
                    }}
                  >
                    <X /> Not them
                  </Button>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="relative">
                <Field
                  label="Name"
                  htmlFor="j-name"
                  error={touched ? errors.customerName : undefined}
                >
                  <Input
                    id="j-name"
                    autoComplete="off"
                    value={draft.customerName}
                    onChange={(e) => {
                      set("customerName", e.target.value);
                      setSuggestOpen(true);
                    }}
                    onFocus={() => setSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                  />
                </Field>
                {suggestOpen && suggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
                    {suggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickCustomer(c)}
                        className="block w-full px-3 py-2 text-left hover:bg-muted"
                      >
                        <span className="block text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatPhone(c.phone)}
                          {c.sites[0] && ` · ${c.sites[0].address}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Field label="Phone" htmlFor="j-phone" error={touched ? errors.phone : undefined}>
                <Input
                  id="j-phone"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="07X XXX XXXX"
                  value={draft.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
            </div>
            {phoneMatch && (
              <button
                type="button"
                onClick={() => pickCustomer(phoneMatch)}
                className="w-full rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-left text-sm"
              >
                This number belongs to <strong>{phoneMatch.name}</strong>. Tap to use their profile.
              </button>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Second phone (optional)" htmlFor="j-alt">
                <Input
                  id="j-alt"
                  inputMode="tel"
                  value={draft.altPhone}
                  onChange={(e) => set("altPhone", e.target.value)}
                />
              </Field>
              {!customer && (
                <Field label="Customer type" htmlFor="j-type">
                  <Select
                    id="j-type"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as Customer["type"])}
                  >
                    {CUSTOMER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {!customer && (
                <Field label="Email (optional)" htmlFor="j-email">
                  <Input
                    id="j-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </Field>
              )}
            </div>
          </Block>

          {/* Site */}
          <Block title="Site">
            {customer && customer.sites.length > 1 && (
              <Field label="Saved sites" htmlFor="j-site">
                <Select
                  id="j-site"
                  value={customer.sites.find((s) => s.address === draft.address)?.id ?? ""}
                  onChange={(e) => {
                    const site = customer.sites.find((s) => s.id === e.target.value);
                    if (!site) return;
                    set("address", site.address);
                    setLocation(site.locationId);
                  }}
                >
                  <option value="">A new address</option>
                  {customer.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}: {s.address}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Address" htmlFor="j-address">
              <Textarea
                id="j-address"
                rows={2}
                value={draft.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location" htmlFor="j-loc">
                <Select
                  id="j-loc"
                  value={draft.locationId}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  {!locations.some((l) => l.id === draft.locationId) && draft.locationName && (
                    <option value={draft.locationId}>{draft.locationName}</option>
                  )}
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Transport fee" htmlFor="j-fee">
                <Input
                  id="j-fee"
                  type="number"
                  inputMode="decimal"
                  value={draft.transportFee}
                  onChange={(e) => set("transportFee", toAmount(e.target.value))}
                />
              </Field>
            </div>
          </Block>

          {/* Work */}
          <Block
            title="Overhead tanks"
            action={
              <Button variant="outline" size="sm" onClick={addTank}>
                <Plus /> Tank
              </Button>
            }
          >
            {draft.tanks.length === 0 && (
              <Hint>No tanks. Add one if the job includes overhead tanks.</Hint>
            )}
            {draft.tanks.map((t, i) => {
              const custom = t.sizeId === null;
              const update = (patch: Partial<TankItem>) =>
                set(
                  "tanks",
                  draft.tanks.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div key={t.id} className="space-y-2 rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <Select
                      aria-label={`Tank ${i + 1} size`}
                      value={t.sizeId ?? "custom"}
                      onChange={(e) => {
                        const s = sizes.find((x) => x.id === e.target.value);
                        if (s)
                          update({
                            sizeId: s.id,
                            label: s.label,
                            litres: s.litres,
                            price: s.price,
                          });
                        else update({ sizeId: null, label: "Custom", price: 0 });
                      }}
                    >
                      {sizes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} · {formatAmount(s.price)}
                        </option>
                      ))}
                      {t.sizeId && !sizes.some((s) => s.id === t.sizeId) && (
                        <option value={t.sizeId}>{t.label}</option>
                      )}
                      <option value="custom">Custom size</option>
                    </Select>
                    <Input
                      aria-label={`Tank ${i + 1} price`}
                      type="number"
                      inputMode="decimal"
                      className="w-32"
                      value={t.price}
                      onChange={(e) => update({ price: toAmount(e.target.value) })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove tank ${i + 1}`}
                      onClick={() =>
                        set(
                          "tanks",
                          draft.tanks.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {custom && (
                    <div className="grid grid-cols-2 gap-2 pl-8">
                      <Input
                        aria-label="Custom size label"
                        placeholder="Label, e.g. 1250L"
                        value={t.label === "Custom" ? "" : t.label}
                        onChange={(e) => update({ label: e.target.value || "Custom" })}
                      />
                      <Input
                        aria-label="Custom size litres"
                        type="number"
                        inputMode="numeric"
                        placeholder="Litres"
                        value={t.litres || ""}
                        onChange={(e) => update({ litres: toAmount(e.target.value) })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </Block>

          <Block
            title="Underground sumps"
            action={
              <Button variant="outline" size="sm" onClick={addSump}>
                <Plus /> Sump
              </Button>
            }
          >
            {draft.sumps.length === 0 && <Hint>No sumps. Priced by volume in cubic feet.</Hint>}
            {draft.sumps.map((s, i) => {
              const update = (patch: Partial<SumpItem>) =>
                set(
                  "sumps",
                  draft.sumps.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div key={s.id} className="space-y-2 rounded-lg border p-2.5">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                    {(["length", "breadth", "height"] as const).map((dim) => (
                      <Field
                        key={dim}
                        label={`${dim[0]!.toUpperCase()}${dim.slice(1)} (ft)`}
                        htmlFor={`s-${s.id}-${dim}`}
                      >
                        <Input
                          id={`s-${s.id}-${dim}`}
                          type="number"
                          inputMode="decimal"
                          value={s[dim] || ""}
                          onChange={(e) => update({ [dim]: toAmount(e.target.value) })}
                        />
                      </Field>
                    ))}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove sump ${i + 1}`}
                      onClick={() =>
                        set(
                          "sumps",
                          draft.sumps.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <label className="flex items-center gap-2">
                      Rate per ft³
                      <Input
                        aria-label={`Sump ${i + 1} rate`}
                        type="number"
                        inputMode="decimal"
                        className="h-8 w-24"
                        value={s.rate}
                        onChange={(e) => update({ rate: toAmount(e.target.value) })}
                      />
                    </label>
                    <span className="font-semibold text-primary">
                      {sumpVolume(s)} ft³ · {formatLKR(sumpVolume(s) * s.rate)}
                    </span>
                  </div>
                </div>
              );
            })}
          </Block>

          <Block title="Extras">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
              <div className="flex items-center gap-3">
                <Switch
                  label="Ladder needed"
                  checked={draft.ladderNeeded}
                  onCheckedChange={(on) =>
                    setDraft((d) => ({
                      ...d,
                      ladderNeeded: on,
                      ladderFee: on && !d.ladderFee ? settings.pricing.ladderFee : d.ladderFee,
                    }))
                  }
                />
                <span className="text-sm font-medium">Ladder needed</span>
              </div>
              {draft.ladderNeeded && (
                <Input
                  aria-label="Ladder fee"
                  type="number"
                  inputMode="decimal"
                  className="w-32"
                  value={draft.ladderFee}
                  onChange={(e) => set("ladderFee", toAmount(e.target.value))}
                />
              )}
            </div>
            {draft.addOns.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2">
                <Input
                  aria-label="Add-on name"
                  placeholder="e.g. Tank lid replacement"
                  value={a.name}
                  onChange={(e) =>
                    set(
                      "addOns",
                      draft.addOns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  aria-label="Add-on price"
                  type="number"
                  inputMode="decimal"
                  className="w-32"
                  value={a.price || ""}
                  onChange={(e) =>
                    set(
                      "addOns",
                      draft.addOns.map((x, j) =>
                        j === i ? { ...x, price: toAmount(e.target.value) } : x,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove add-on"
                  onClick={() =>
                    set(
                      "addOns",
                      draft.addOns.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Minus />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set("addOns", [...draft.addOns, { id: uid(), name: "", price: 0 }])}
              >
                <Plus /> Add-on
              </Button>
              <Field label="Discount (LKR)" htmlFor="j-discount" className="w-40">
                <Input
                  id="j-discount"
                  type="number"
                  inputMode="decimal"
                  value={draft.discount || ""}
                  onChange={(e) => set("discount", toAmount(e.target.value))}
                />
              </Field>
            </div>
          </Block>

          {/* Schedule */}
          <Block title="Status and schedule">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" htmlFor="j-status">
                <Select
                  id="j-status"
                  value={draft.status}
                  onChange={(e) => set("status", e.target.value as JobStatus)}
                >
                  {[...new Set(allowedStatuses)].map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Source" htmlFor="j-source">
                <Select
                  id="j-source"
                  value={draft.source}
                  onChange={(e) => set("source", e.target.value as JobDraft["source"])}
                >
                  {JOB_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="j-date" error={touched ? errors.date : undefined}>
                <Input
                  id="j-date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
              <Field label="Start time" htmlFor="j-time">
                <Input
                  id="j-time"
                  type="time"
                  value={draft.time}
                  onChange={(e) => set("time", e.target.value)}
                />
              </Field>
              <Field label="End date (multi-day)" htmlFor="j-end" error={errors.endDate}>
                <Input
                  id="j-end"
                  type="date"
                  min={draft.date || undefined}
                  value={draft.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </Field>
              <Field label="Enquiry date" htmlFor="j-intake">
                <Input
                  id="j-intake"
                  type="date"
                  value={draft.intakeDate}
                  onChange={(e) => set("intakeDate", e.target.value)}
                />
              </Field>
            </div>
            <label className="flex items-center gap-3 rounded-lg border p-2.5 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={draft.inspectionNeeded}
                onChange={(e) => set("inspectionNeeded", e.target.checked)}
              />
              Needs a site inspection before the work
            </label>
          </Block>

          <Block title="Crew and equipment">
            <Field label="Supervisor" htmlFor="j-sup">
              <Select
                id="j-sup"
                value={draft.supervisorId}
                onChange={(e) => set("supervisorId", e.target.value)}
              >
                <option value="">Unassigned</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <ChipGroup
              label="Technicians"
              empty="Add technicians under Staff."
              options={technicians.map((t) => ({ id: t.id, label: t.name }))}
              value={draft.technicianIds}
              onChange={(v) => set("technicianIds", v)}
            />
            <ChipGroup
              label="Equipment"
              empty="Add equipment under Settings."
              options={equipment.map((e) => ({ id: e.id, label: e.name }))}
              value={draft.equipmentIds}
              onChange={(v) => set("equipmentIds", v)}
            />
          </Block>

          <Block title="Notes">
            <Textarea
              aria-label="Notes"
              rows={3}
              placeholder="Access, water level, special instructions…"
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Block>
        </div>

        <div className="border-t bg-card px-5 py-3">
          <div className="mb-3 space-y-1 text-sm">
            {summary.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-3 text-muted-foreground">
                <span className="truncate">
                  {l.title}
                  {l.detail && l.kind === "tank" ? ` · ${l.detail}` : ""}
                  {l.qty > 1 ? ` × ${l.qty}` : ""}
                </span>
                <span className="tabular-nums">{formatAmount(l.amount)}</span>
              </div>
            ))}
            {summary.discount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Discount</span>
                <span className="tabular-nums">−{formatAmount(summary.discount)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold tabular-nums">{formatLKR(summary.total)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : job ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Block({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
  empty,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  empty: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {options.length === 0 ? (
        <Hint>{empty}</Hint>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
