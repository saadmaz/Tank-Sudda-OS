import { useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { useAuth } from "@/lib/auth";
import type { Job } from "@/lib/job";
import { isManagerOrAbove } from "@/lib/permissions";
import { addJobPhoto, removeJobPhoto, type JobPhoto, type PhotoKind } from "@/lib/photos";

const KINDS: { kind: PhotoKind; label: string }[] = [
  { kind: "before", label: "Before" },
  { kind: "after", label: "After" },
  { kind: "other", label: "Other" },
];

export function JobPhotos({ job }: { job: Job }) {
  const { session, online } = useAuth();
  const photos = job.photos ?? [];
  const [uploading, setUploading] = useState<PhotoKind | null>(null);
  const [open, setOpen] = useState<JobPhoto | null>(null);

  const upload = async (files: FileList | null, kind: PhotoKind) => {
    if (!files?.length) return;
    if (!online)
      return void toast.error("Photos need a connection. Try again when you're back online.");
    setUploading(kind);
    try {
      for (const f of Array.from(files).slice(0, 10)) await addJobPhoto(job.id, f, kind);
      toast.success(files.length > 1 ? `${files.length} photos added` : "Photo added");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't upload the photo.");
    } finally {
      setUploading(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Photos</CardTitle>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(({ kind, label }) => (
            <Button key={kind} variant="outline" size="sm" asChild disabled={!!uploading}>
              <label className="cursor-pointer">
                {uploading === kind ? <Loader2 className="animate-spin" /> : <Camera />} {label}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void upload(e.target.files, kind);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Take before and after photos to show the customer the difference.
          </p>
        ) : (
          <div className="space-y-3">
            {KINDS.map(({ kind, label }) => {
              const list = photos.filter((p) => p.kind === kind);
              if (!list.length) return null;
              return (
                <div key={kind}>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {list.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setOpen(p)}
                        className="aspect-square overflow-hidden rounded-lg border bg-muted"
                      >
                        <img
                          src={p.url}
                          alt={`${label} photo`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {open && (
            <div className="space-y-2">
              <img
                src={open.url}
                alt="Job photo"
                className="max-h-[75dvh] w-full rounded-md object-contain"
              />
              <div className="flex items-center justify-between px-2 pb-1 text-xs text-muted-foreground">
                <span>{new Date(open.at).toLocaleString("en-GB")}</span>
                {isManagerOrAbove(session?.role) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void removeJobPhoto(job.id, open)
                        .then(() => setOpen(null))
                        .catch(() => toast.error("Couldn't remove the photo."))
                    }
                  >
                    <Trash2 /> Remove
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
