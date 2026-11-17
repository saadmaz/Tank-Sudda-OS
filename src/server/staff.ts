"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";
import {
  STAFF_ROLES,
  hasModule,
  isAdmin,
  isStaffRole,
  mayActOn,
  mayAssignRole,
  permissionsFor,
  sanitizePermissions,
  type StaffRole,
} from "@/lib/permissions";
import {
  PIN_RE,
  STAFF_COLORS,
  USERNAME_RE,
  usernameKey,
  type StaffLogin,
  type StaffMember,
} from "@/lib/staff";

export type StaffActionError =
  | "unauthorized" // not signed in, inactive, or lacks Admin + the staff module
  | "forbidden" // outranked by the target or the role being granted
  | "not_found"
  | "username_taken"
  | "pin_required"
  | "self_target"; // cannot deactivate, demote or remove your own sign-in

export type StaffActionResult =
  { success: true; staffId: string } | { success: false; error: StaffActionError };

interface Caller {
  uid: string;
  role: StaffRole;
}

/** Verifies the token and confirms the caller is an active administrator. */
async function requireAdmin(idToken: string): Promise<Caller | null> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const staff = (await adminDb.collection("staff").doc(decoded.uid).get()).data() as
      StaffMember | undefined;
    const role = staff?.login?.role;
    if (!staff?.active || !isStaffRole(role) || !isAdmin(role)) return null;
    if (!hasModule(role, staff.login?.permissions, "staff")) return null;
    return { uid: decoded.uid, role };
  } catch {
    return null;
  }
}

/** Ends every session of a person whose access changed. Best effort. */
async function revokeSessions(staffId: string) {
  try {
    await adminAuth.revokeRefreshTokens(staffId);
  } catch (err) {
    // A person who has never signed in has no Auth user yet; nothing to revoke.
    if ((err as { code?: string }).code !== "auth/user-not-found") {
      console.error(`[staff] revoke(${staffId}) failed:`, err);
    }
  }
}

const LoginSchema = z
  .object({
    username: z.string().trim().regex(USERNAME_RE),
    role: z.enum(STAFF_ROLES),
    permissions: z.array(z.string()).max(32),
  })
  .nullable();

const SaveStaffSchema = z.object({
  idToken: z.string().min(1),
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().max(24),
  crewRoles: z.array(z.enum(["supervisor", "technician"])).max(2),
  color: z.string().trim().min(3).max(32).optional(),
  active: z.boolean(),
  login: LoginSchema,
  /** Required the first time a person is given a sign-in; optional after. */
  pin: z.string().regex(PIN_RE).optional(),
});

export const saveStaffFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => SaveStaffSchema.parse(raw))
  .handler(async ({ data }): Promise<StaffActionResult> => {
    const caller = await requireAdmin(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };

    const ref = data.id
      ? adminDb.collection("staff").doc(data.id)
      : adminDb.collection("staff").doc();
    const staffId = ref.id;
    const existing = data.id ? ((await ref.get()).data() as StaffMember | undefined) : undefined;
    if (data.id && !existing) return { success: false, error: "not_found" };

    // Seniority: you may only edit people junior to you, and only grant roles
    // up to your own.
    if (existing?.login && !mayActOn(caller.role, existing.login.role) && staffId !== caller.uid) {
      return { success: false, error: "forbidden" };
    }
    if (data.login && !mayAssignRole(caller.role, data.login.role)) {
      return { success: false, error: "forbidden" };
    }
    if (staffId === caller.uid) {
      const demoted = !data.login || data.login.role !== caller.role;
      if (!data.active || demoted) return { success: false, error: "self_target" };
    }

    const login: StaffLogin | null = data.login
      ? {
          username: data.login.username,
          role: data.login.role,
          // Your own module list can only be changed by someone senior to you.
          permissions:
            staffId === caller.uid && existing?.login
              ? existing.login.permissions
              : permissionsFor(data.login.role, data.login.permissions),
        }
      : null;

    const hadLogin = !!existing?.login;
    if (login && !hadLogin && !data.pin) return { success: false, error: "pin_required" };

    const now = new Date().toISOString();
    const oldKey = existing?.login ? usernameKey(existing.login.username) : null;
    const newKey = login ? usernameKey(login.username) : null;
    // Hashed once, outside the transaction: a retried transaction must not re-hash.
    const pinHash = login && data.pin ? await bcrypt.hash(data.pin, 10) : null;

    try {
      await adminDb.runTransaction(async (tx) => {
        if (newKey && newKey !== oldKey) {
          const claim = adminDb.collection("usernames").doc(newKey);
          const snap = await tx.get(claim);
          if (snap.exists && snap.data()?.staffId !== staffId) throw new Error("username_taken");
          tx.set(claim, { staffId });
        }
        if (oldKey && oldKey !== newKey) tx.delete(adminDb.collection("usernames").doc(oldKey));

        const record: StaffMember = {
          id: staffId,
          name: data.name,
          phone: data.phone,
          crewRoles: data.crewRoles,
          active: data.active,
          login,
          color:
            data.color ??
            existing?.color ??
            STAFF_COLORS[Math.floor(Math.random() * STAFF_COLORS.length)]!,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        tx.set(ref, record);

        const credRef = adminDb.collection("staffCredentials").doc(staffId);
        if (login && pinHash) {
          tx.set(
            credRef,
            {
              pinHash,
              failCount: 0,
              lockedUntil: null,
              mustChangePin: staffId !== caller.uid,
            },
            { merge: true },
          );
        } else if (!login && hadLogin) {
          tx.delete(credRef);
        }

        tx.set(adminDb.collection("auditLog").doc(), {
          at: now,
          actorId: caller.uid,
          action: existing ? "staff.update" : "staff.create",
          entity: "staff",
          entityId: staffId,
          summary: `${existing ? "Updated" : "Added"} ${data.name}`,
        });
      });
    } catch (err) {
      if ((err as Error).message === "username_taken") {
        return { success: false, error: "username_taken" };
      }
      throw err;
    }

    const accessChanged =
      !!existing &&
      (existing.active !== data.active ||
        existing.login?.role !== login?.role ||
        JSON.stringify(sanitizePermissions(existing.login?.permissions)) !==
          JSON.stringify(login?.permissions ?? []) ||
        (hadLogin && !login));
    if (accessChanged || (data.pin && hadLogin)) await revokeSessions(staffId);

    return { success: true, staffId };
  });

const ResetPinSchema = z.object({
  idToken: z.string().min(1),
  staffId: z.string().min(1),
  pin: z.string().regex(PIN_RE),
});

/** Issues a one-time PIN; the person must choose their own at next sign-in. */
export const resetStaffPinFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => ResetPinSchema.parse(raw))
  .handler(async ({ data }): Promise<StaffActionResult> => {
    const caller = await requireAdmin(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };
    if (data.staffId === caller.uid) return { success: false, error: "self_target" };

    const staff = (await adminDb.collection("staff").doc(data.staffId).get()).data() as
      StaffMember | undefined;
    if (!staff?.login) return { success: false, error: "not_found" };
    if (!mayActOn(caller.role, staff.login.role)) return { success: false, error: "forbidden" };

    await adminDb
      .collection("staffCredentials")
      .doc(data.staffId)
      .set(
        {
          pinHash: await bcrypt.hash(data.pin, 10),
          failCount: 0,
          lockedUntil: null,
          mustChangePin: true,
        },
        { merge: true },
      );
    await adminDb.collection("auditLog").add({
      at: new Date().toISOString(),
      actorId: caller.uid,
      action: "staff.reset_pin",
      entity: "staff",
      entityId: data.staffId,
      summary: `Reset the PIN for ${staff.name}`,
    });
    await revokeSessions(data.staffId);
    return { success: true, staffId: data.staffId };
  });
