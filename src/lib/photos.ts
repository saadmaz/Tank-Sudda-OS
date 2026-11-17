// Before and after photos on a job, stored in Cloud Storage under
// jobs/{jobId}/photos/. Resized on the phone first so uploads stay quick on
// mobile data and storage stays cheap.

import { arrayRemove, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "./firebase";

export type PhotoKind = "before" | "after" | "other";

export interface JobPhoto {
  id: string;
  path: string;
  url: string;
  kind: PhotoKind;
  at: string;
  by: string;
}

const MAX_EDGE = 1600;

/** Downscales to at most 1600 px on the long edge, as JPEG. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.8),
  );
}

export async function addJobPhoto(jobId: string, file: File, kind: PhotoKind): Promise<JobPhoto> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const path = `jobs/${jobId}/photos/${kind}-${id}.jpg`;
  const blob = await compressImage(file);
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: "image/jpeg" });
  const photo: JobPhoto = {
    id,
    path,
    url: await getDownloadURL(r),
    kind,
    at: new Date().toISOString(),
    by: auth.currentUser?.uid ?? "",
  };
  await updateDoc(doc(db, "jobs", jobId), { photos: arrayUnion(photo) });
  return photo;
}

export async function removeJobPhoto(jobId: string, photo: JobPhoto): Promise<void> {
  await updateDoc(doc(db, "jobs", jobId), { photos: arrayRemove(photo) });
  await deleteObject(ref(storage, photo.path)).catch(() => {
    // Already gone; the record is what matters.
  });
}
