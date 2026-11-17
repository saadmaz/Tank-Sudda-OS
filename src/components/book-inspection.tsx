import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Field } from "./ui/label";
import { Select } from "./ui/select";
import { saveInspection } from "@/lib/db";
import {
  DEFAULT_FINDINGS,
  INSPECTION_TYPES,
  newInspectionRef,
  type Inspection,
  type InspectionType,
} from "@/lib/inspection";
import { OPEN_STATUSES, isoDate, type Job } from "@/lib/job";
import { crewFor } from "@/lib/staff";
import { useStore } from "@/lib/store";

/** Books an inspection for an open lead or job. */
export function BookInspection({ job, onClose }: { job?: Job; onClose: () => void }) {
  const { jobs, staff } = useStore();
  const navigate = useNavigate();
  const open = useMemo(
    () =>
      jobs
        .filter((j) => !j.isDeleted && OPEN_STATUSES.includes(j.status))
        .sort((a, b) => a.customerName.localeCompare(b.customerName)),
    [jobs],
  );
  const [jobId, setJobId] = useState(job?.id ?? "");
  const [type, setType] = useState<InspectionType>(
    job && job.sumps.length && !job.tanks.length ? "sump" : "tank",
  );
  const [date, setDate] = useState(isoDate());
  const [time, setTime] = useState("10:00");
  const supervisors = crewFor(staff, "supervisor");
  const [inspectorId, setInspectorId] = useState(job?.supervisorId || supervisors[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const target = job ?? open.find((j) => j.id === jobId);

  const book = async () => {
    if (!target) return void toast.error("Choose the lead or job to inspect.");
    setBusy(true);
    const ts = new Date().toISOString();
    const i: Inspection = {
      id: newInspectionRef(),
      type,
      status: "scheduled",
      jobId: target.id,
      customerId: target.customerId,
      customerName: target.customerName,
      phone: target.phone,
      address: target.address,
      locationName: target.locationName,
      date,
      time,
      inspectorId,
      findings: {
        ...DEFAULT_FINDINGS,
        ladderRequired: target.ladderNeeded,
      },
      tanks: target.tanks,
      sumps: target.sumps,
      observations: "",
      recommendations: "",
      appliedToJobAt: null,
      createdAt: ts,
      createdBy: "",
      updatedAt: ts,
      completedAt: null,
    };
    try {
      await saveInspection(i, true);
      toast.success(`Inspection ${i.id} booked`);
      onClose();
      void navigate({ to: "/inspections/$inspectionId", params: { inspectionId: i.id } });
    } catch {
      toast.error("Couldn't book the inspection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book an inspection</DialogTitle>
          <DialogDescription>
            The inspector checks the site and measures the tanks and sumps for an exact quote.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!job && (
            <Field label="Lead or job" htmlFor="bi-job">
              <Select id="bi-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">Choose…</option>
                {open.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.customerName} · {j.id}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Type" htmlFor="bi-type">
            <Select
              id="bi-type"
              value={type}
              onChange={(e) => setType(e.target.value as InspectionType)}
            >
              {INSPECTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="bi-date">
              <Input
                id="bi-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Time" htmlFor="bi-time">
              <Input
                id="bi-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Inspector" htmlFor="bi-insp">
            <Select
              id="bi-insp"
              value={inspectorId}
              onChange={(e) => setInspectorId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void book()} disabled={busy || !target || !date}>
            Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
