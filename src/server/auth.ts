"use server";
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";
import { createRateLimiter } from "./rate-limit";
import { isStaffRole, sanitizePermissions, type StaffRole } from "@/lib/permissions";
import {
  PIN_RE,
  USERNAME_RE,
  isWeakPin,
  lockoutMinutes,
  usernameKey,
  type StaffMember,
} from "@/lib/staff";

// Collections touched here (see firestore.rules):
//   usernames/{key}          → { staffId }                    server only
//   staffCredentials/{id}    → pinHash, failCount, lockedUntil server only
//   staff/{id}               → public directory incl. login role/permissions

export interface Credentials {
  pinHash: string;
  failCount: number;
  lockedUntil: string | null;
  mustChangePin: boolean;
  lastLoginAt?: string | null;
}

export type LoginResult =
  | { success: true; customToken: string; mustChangePin: boolean }
  | {
      success: false;
      error: "invalid" | "locked" | "rate_limited" | "unavailable";
      minutes?: number;
    };

const LoginSchema = z.object({
  username: z.string().trim().regex(USERNAME_RE),
  pin: z.string().regex(PIN_RE),
});

// Per IP and username: slows guessing across accounts without letting one
// noisy device lock everyone else out.
const isLoginRateLimited = createRateLimiter(10 * 60 * 1000, 20);

let dummyHash: string | undefined;

/** Claims carried in the token and read by firestore.rules and the UI. */
export function claimsFor(staff: Pick<StaffMember, "name" | "login">) {
  const role: StaffRole =
    staff.login && isStaffRole(staff.login.role) ? staff.login.role : "Technician";
  return {
    role,
    perms: sanitizePermissions(staff.login?.permissions),
    name: staff.name,
    username: staff.login?.username ?? "",
  };
}

export const loginFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => LoginSchema.parse(raw))
  .handler(async ({ data }): Promise<LoginResult> => {
    const key = usernameKey(data.username);
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (isLoginRateLimited(`${ip}:${key}`)) return { success: false, error: "rate_limited" };

    try {
      const nameSnap = await adminDb.collection("usernames").doc(key).get();
      const staffId = nameSnap.exists ? (nameSnap.data()?.staffId as string) : null;
      if (!staffId) {
        // Spend comparable time so a wrong username isn't distinguishable by timing.
        dummyHash ??= await bcrypt.hash("timing-only", 10);
        await bcrypt.compare(data.pin, dummyHash);
        return { success: false, error: "invalid" };
      }

      const credRef = adminDb.collection("staffCredentials").doc(staffId);
      const [staffSnap, credSnap] = await Promise.all([
        adminDb.collection("staff").doc(staffId).get(),
        credRef.get(),
      ]);
      const staff = staffSnap.data() as StaffMember | undefined;
      const cred = credSnap.data() as Credentials | undefined;
      if (!staff || !cred || !staff.active || !staff.login) {
        return { success: false, error: "invalid" };
      }

      const now = Date.now();
      if (cred.lockedUntil && Date.parse(cred.lockedUntil) > now) {
        return {
          success: false,
          error: "locked",
          minutes: Math.ceil((Date.parse(cred.lockedUntil) - now) / 60_000),
        };
      }

      if (!(await bcrypt.compare(data.pin, cred.pinHash))) {
        const failCount = (cred.failCount ?? 0) + 1;
        const minutes = lockoutMinutes(failCount);
        await credRef.update({
          failCount,
          lockedUntil: minutes > 0 ? new Date(now + minutes * 60_000).toISOString() : null,
        });
        return minutes > 0
          ? { success: false, error: "locked", minutes }
          : { success: false, error: "invalid" };
      }

      const customToken = await adminAuth.createCustomToken(staffId, {
        ...claimsFor(staff),
        mcp: !!cred.mustChangePin,
      });
      await credRef.update({
        failCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(now).toISOString(),
      });
      return { success: true, customToken, mustChangePin: !!cred.mustChangePin };
    } catch (err) {
      console.error("[auth] login failed:", err);
      return { success: false, error: "unavailable" };
    }
  });

// ── Change own PIN ───────────────────────────────────────────────────────────

const ChangePinSchema = z.object({
  idToken: z.string().min(1),
  currentPin: z.string().regex(PIN_RE),
  newPin: z.string().regex(PIN_RE),
});

export type ChangePinResult =
  | { success: true }
  | { success: false; error: "unauthorized" | "wrong_pin" | "weak_pin" | "same_pin" };

export const changeOwnPinFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => ChangePinSchema.parse(raw))
  .handler(async ({ data }): Promise<ChangePinResult> => {
    let uid: string;
    try {
      uid = (await adminAuth.verifyIdToken(data.idToken)).uid;
    } catch {
      return { success: false, error: "unauthorized" };
    }
    if (data.newPin === data.currentPin) return { success: false, error: "same_pin" };
    if (isWeakPin(data.newPin)) return { success: false, error: "weak_pin" };

    const credRef = adminDb.collection("staffCredentials").doc(uid);
    const cred = (await credRef.get()).data() as Credentials | undefined;
    if (!cred) return { success: false, error: "unauthorized" };

    // Re-prove the current PIN, so an unlocked, unattended phone isn't enough
    // to take over the account.
    if (!(await bcrypt.compare(data.currentPin, cred.pinHash))) {
      return { success: false, error: "wrong_pin" };
    }

    await credRef.update({
      pinHash: await bcrypt.hash(data.newPin, 10),
      mustChangePin: false,
      failCount: 0,
      lockedUntil: null,
    });
    return { success: true };
  });
