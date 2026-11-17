import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { doc } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { toAmount } from "@/lib/currency";
import { applyInspectionToJob, saveInspection, setInspectionStatus } from "@/lib/db";
import { inspectionReport } from "@/lib/documents";
import { db } from "@/lib/firebase";
import {
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPES,
  inspectionWarnings,
  normalizeFindings,
  type Findings,
  type Inspection,
} from "@/lib/inspection";
import type { Job } from "@/lib/job";
import { formatPhone, telLink } from "@/lib/phone";
import { sumpVolume } from "@/lib/pricing";
import { activeTankSizes } from "@/lib/settings";
import { crewFor } from "@/lib/staff";
import { useLiveDoc, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inspections/$inspectionId")({
  component: InspectionPage,
});

function InspectionPage() {
  const { inspectionId } = Route.useParams();
  const ref = useMemo(() => doc(db, "inspections", inspectionId), [inspectionId]);
  const { data, ready } = useLiveDoc(ref);
  if (!ready)
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  if (!data)
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <EmptyState title="Inspection not found" />
      </div>
    );
  const i = data as unknown as Inspection;
  return (
    <InspectionView key={i.id} inspection={{ ...i, findings: normalizeFindings(i.findings) }} />
  );
}

const uid = () => Math.random().toString(36).slice(2, 9);

// Fields the server changes (status, timestamps); never part of an edit.
const META = [
  "status",
  "updatedAt",
  "completedAt",
  "appliedToJobAt",
  "createdAt",
  "createdBy",
] as const;
const content = (i: Inspection) => {
  const copy: Record<string, unknown> = { ...i };
  for (const k of META) delete copy[k];
  return JSON.stringify(copy);
};

function InspectionView({ inspection }: { inspection: Inspection }) {
  const { settings, staff, jobs } = useStore();
  const { session } = useAuth();
  const [draft, setDraft] = useState(inspection);
  const [busy, setBusy] = useState(false);
  const dirty = content(draft) !== content(inspection);
  const locked = inspection.status !== "scheduled";
  const fieldRole = session?.role === "Technician" || session?.role === "Supervisor";
  const job = jobs.find((j) => j.id === inspection.jobId) as Job | undefined;
  const sizes = activeTankSizes(settings);
  const inspectorName = staff.find((s) => s.id === draft.inspectorId)?.name ?? "";

  useEffect(() => {
    if (!dirty) setDraft(inspection);
    else
      setDraft((d) => ({
        ...d,
        ...Object.fromEntries(META.map((k) => [k, inspection[k]])),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspection]);

  const setF = <K extends keyof Findings>(k: K, v: Findings[K]) =>
    setDraft((d) => ({ ...d, findings: { ...d.findings, [k]: v } }));
  const set = <K extends keyof Inspection>(k: K, v: Inspection[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save. Check your connection and access.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(() => saveInspection(draft, false), "Saved");
  const complete = () =>
    run(async () => {
      if (dirty) await saveInspection(draft, false);
      await setInspectionStatus(draft, "completed");
    }, "Inspection completed");
  const report = (share: boolean) =>
    run(() => inspectionReport(draft, settings, inspectorName, share), "Report ready");

  const f = draft.findings;
  const t = draft.type;
  const warnings = inspectionWarnings(draft);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-28 sm:p-6 sm:pb-28">
      <div className="space-y-1.5">
        <Link
          to="/inspections"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Inspections
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight">{draft.customerName}</h2>
          <Badge
            tone={
              draft.status === "completed"
                ? "success"
                : draft.status === "cancelled"
                  ? "danger"
                  : "warning"
            }
          >
            {INSPECTION_STATUS_LABEL[draft.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono text-xs">{draft.id}</span> ·{" "}
          {INSPECTION_TYPES.find((x) => x.value === t)?.label} ·{" "}
          <a href={telLink(draft.phone)} className="hover:underline">
            {formatPhone(draft.phone)}
          </a>{" "}
          · {draft.address || draft.locationName}
          {job && (
            <>
              {" · "}
              <Link
                to="/jobs/$jobId"
                params={{ jobId: job.id }}
                className="font-semibold text-primary"
              >
                {job.id}
              </Link>
            </>
          )}
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          {warnings.map((w) => (
            <p key={w} className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" /> {w}
            </p>
          ))}
        </div>
      )}

      <fieldset disabled={locked} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Visit</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="i-date">
              <Input
                id="i-date"
                type="date"
                value={draft.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field label="Time" htmlFor="i-time">
              <Input
                id="i-time"
                type="time"
                value={draft.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </Field>
            <Field label="Inspector" htmlFor="i-insp" className="col-span-2 sm:col-span-1">
              <Select
                id="i-insp"
                value={draft.inspectorId}
                onChange={(e) => set("inspectorId", e.target.value)}
              >
                <option value="">Unassigned</option>
                {crewFor(staff, "supervisor").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <YesNo
              risk
              label="Site safe to work"
              value={f.siteSafe}
              onChange={(v) => setF("siteSafe", v)}
            />
            <YesNo
              risk
              label="Electricity point available"
              value={f.electricityAccess}
              onChange={(v) => setF("electricityAccess", v)}
            />
            {t === "tank" && (
              <>
                <YesNo
                  risk
                  label="Water supply can be shut off"
                  value={f.waterSupplyCanBeShut}
                  onChange={(v) => setF("waterSupplyCanBeShut", v)}
                />
                <YesNo
                  label="Outer tank present"
                  value={f.outerTank}
                  onChange={(v) => setF("outerTank", v)}
                />
                <YesNo
                  label="Ladder required"
                  value={f.ladderRequired}
                  onChange={(v) => setF("ladderRequired", v)}
                />
                <Choice
                  label="Tank material"
                  value={f.tankMaterial}
                  options={["plastic", "concrete", "steel", "other"]}
                  onChange={(v) => setF("tankMaterial", v as Findings["tankMaterial"])}
                />
                <Field label="Access height (ft)" htmlFor="i-height">
                  <Input
                    id="i-height"
                    type="number"
                    inputMode="decimal"
                    value={f.accessHeightFt || ""}
                    onChange={(e) => setF("accessHeightFt", toAmount(e.target.value))}
                  />
                </Field>
              </>
            )}
            {t === "sump" && (
              <>
                <YesNo
                  risk
                  label="Proper access to the sump"
                  value={f.properAccess}
                  onChange={(v) => setF("properAccess", v)}
                />
                <Choice
                  label="Water level"
                  value={f.waterLevel}
                  options={["full", "half", "low", "empty"]}
                  onChange={(v) => setF("waterLevel", v as Findings["waterLevel"])}
                />
              </>
            )}
            {t !== "cleaning" && (
              <>
                <Choice
                  label="Sediment"
                  value={f.sediment}
                  options={["low", "medium", "high"]}
                  onChange={(v) => setF("sediment", v as Findings["sediment"])}
                />
                <Choice
                  label={t === "tank" ? "Tank condition" : "Sump condition"}
                  value={f.condition}
                  options={["good", "fair", "poor"]}
                  onChange={(v) => setF("condition", v as Findings["condition"])}
                />
                <Choice
                  label="Valves and fittings"
                  value={f.fittingsCondition}
                  options={["good", "fair", "poor"]}
                  onChange={(v) => setF("fittingsCondition", v as Findings["fittingsCondition"])}
                />
              </>
            )}
            {t === "cleaning" && (
              <>
                <Choice
                  label="Category"
                  value={f.category}
                  options={["residential", "commercial"]}
                  onChange={(v) => setF("category", v as Findings["category"])}
                />
                <YesNo
                  label="Multi-storey"
                  value={f.multiStorey}
                  onChange={(v) => setF("multiStorey", v)}
                />
                <Choice
                  label="Cleaning type"
                  value={f.cleaningType}
                  options={["standard", "deep", "move-in", "post-construction"]}
                  onChange={(v) => setF("cleaningType", v as Findings["cleaningType"])}
                />
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["floorAreaSqft", "Floor area (sq ft)"],
                      ["bedrooms", "Bedrooms"],
                      ["bathrooms", "Bathrooms"],
                    ] as const
                  ).map(([k, label]) => (
                    <Field key={k} label={label} htmlFor={`i-${k}`}>
                      <Input
                        id={`i-${k}`}
                        type="number"
                        inputMode="numeric"
                        value={f[k] || ""}
                        onChange={(e) => setF(k, toAmount(e.target.value))}
                      />
                    </Field>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {t !== "cleaning" && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Measurements</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const s = sizes.find((x) => x.litres === 1000) ?? sizes[0];
                    set("tanks", [
                      ...draft.tanks,
                      {
                        id: uid(),
                        sizeId: s?.id ?? null,
                        label: s?.label ?? "Custom",
                        litres: s?.litres ?? 0,
                        price: s?.price ?? 0,
                      },
                    ]);
                  }}
                >
                  <Plus /> Tank
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    set("sumps", [
                      ...draft.sumps,
                      {
                        id: uid(),
                        length: 0,
                        breadth: 0,
                        height: 0,
                        rate: settings.pricing.sumpRatePerCubicFt,
                      },
                    ])
                  }
                >
                  <Plus /> Sump
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {draft.tanks.length + draft.sumps.length === 0 && (
                <p className="text-sm text-muted-foreground">Add each tank and sump you measure.</p>
              )}
              {draft.tanks.map((tk, n) => (
                <div key={tk.id} className="flex items-center gap-2">
                  <span className="w-14 text-xs font-semibold text-muted-foreground">
                    Tank {n + 1}
                  </span>
                  <Select
                    aria-label={`Tank ${n + 1} size`}
                    value={tk.sizeId ?? "custom"}
                    onChange={(e) => {
                      const s = sizes.find((x) => x.id === e.target.value);
                      set(
                        "tanks",
                        draft.tanks.map((x, j) =>
                          j === n
                            ? s
                              ? {
                                  ...x,
                                  sizeId: s.id,
                                  label: s.label,
                                  litres: s.litres,
                                  price: s.price,
                                }
                              : { ...x, sizeId: null, label: "Custom", price: 0 }
                            : x,
                        ),
                      );
                    }}
                  >
                    {sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                    <option value="custom">Custom</option>
                  </Select>
                  {tk.sizeId === null && (
                    <Input
                      aria-label="Litres"
                      type="number"
                      inputMode="numeric"
                      placeholder="Litres"
                      className="w-28"
                      value={tk.litres || ""}
                      onChange={(e) => {
                        const litres = toAmount(e.target.value);
                        set(
                          "tanks",
                          draft.tanks.map((x, j) =>
                            j === n ? { ...x, litres, label: `${litres}L` } : x,
                          ),
                        );
                      }}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove tank ${n + 1}`}
                    onClick={() =>
                      set(
                        "tanks",
                        draft.tanks.filter((_, j) => j !== n),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {draft.sumps.map((s, n) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-14 text-xs font-semibold text-muted-foreground">
                    Sump {n + 1}
                  </span>
                  {(["length", "breadth", "height"] as const).map((dim) => (
                    <Input
                      key={dim}
                      aria-label={`Sump ${n + 1} ${dim} in feet`}
                      placeholder={`${dim[0]!.toUpperCase()} ft`}
                      type="number"
                      inputMode="decimal"
                      className="w-20"
                      value={s[dim] || ""}
                      onChange={(e) =>
                        set(
                          "sumps",
                          draft.sumps.map((x, j) =>
                            j === n ? { ...x, [dim]: toAmount(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  ))}
                  <span className="text-xs font-semibold text-primary">{sumpVolume(s)} ft³</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove sump ${n + 1}`}
                    onClick={() =>
                      set(
                        "sumps",
                        draft.sumps.filter((_, j) => j !== n),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Notes for the report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Observations" htmlFor="i-obs">
              <Textarea
                id="i-obs"
                rows={3}
                value={draft.observations}
                onChange={(e) => set("observations", e.target.value)}
              />
            </Field>
            <Field label="Recommendations" htmlFor="i-rec">
              <Textarea
                id="i-rec"
                rows={3}
                value={draft.recommendations}
                onChange={(e) => set("recommendations", e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      </fieldset>

      {draft.status === "completed" && job && !fieldRole && (
        <Card className="border-primary/30">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-sm font-semibold">
                {draft.appliedToJobAt
                  ? "Measurements applied to the job"
                  : "Price the job from these measurements"}
              </p>
              <p className="text-xs text-muted-foreground">
                Replaces the tanks and sumps on {job.id} and recalculates its total.
              </p>
            </div>
            <Button
              variant={draft.appliedToJobAt ? "outline" : "default"}
              disabled={busy}
              onClick={() =>
                void run(() => applyInspectionToJob(draft, job), `${job.id} re-priced`)
              }
            >
              <Check /> {draft.appliedToJobAt ? "Apply again" : "Apply to job"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void report(false)}>
            <Download /> Report
          </Button>
          <Button
            variant="outline"
            className="sm:hidden"
            disabled={busy}
            onClick={() => void report(true)}
          >
            <Share2 /> Share
          </Button>
          {!locked && (
            <>
              {dirty && (
                <Button variant="outline" disabled={busy} onClick={() => void save()}>
                  Save
                </Button>
              )}
              <Button disabled={busy} onClick={() => void complete()}>
                <Check /> Complete
              </Button>
            </>
          )}
          {!locked && !fieldRole && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(() => setInspectionStatus(draft, "cancelled"), "Inspection cancelled")
              }
            >
              Cancel visit
            </Button>
          )}
          {locked && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => setInspectionStatus(draft, "scheduled"), "Reopened")}
            >
              Reopen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Segments({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string; tone?: "bad" }[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 min-w-14 rounded-md border px-3 text-sm font-medium capitalize transition-colors disabled:opacity-60",
            value === o.value
              ? o.tone === "bad"
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-primary bg-primary text-primary-foreground"
              : "bg-card hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
  risk,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  /** "No" is a problem the office must know about. */
  risk?: boolean;
}) {
  return (
    <Row label={label}>
      <Segments
        label={label}
        value={value ? "yes" : "no"}
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No", tone: risk ? "bad" : undefined },
        ]}
        onChange={(v) => onChange(v === "yes")}
      />
    </Row>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Row label={label}>
      <Segments
        label={label}
        value={value}
        options={options.map((o) => ({
          value: o,
          label: o.replace(/-/g, " "),
          tone: o === "poor" || o === "high" ? "bad" : undefined,
        }))}
        onChange={onChange}
      />
    </Row>
  );
}
