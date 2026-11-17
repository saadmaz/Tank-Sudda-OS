import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onIdTokenChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { changeOwnPinFn, loginFn, type ChangePinResult } from "@/server/auth";
import {
  hasModule,
  isStaffRole,
  sanitizePermissions,
  type ModuleKey,
  type StaffRole,
} from "./permissions";

export interface Session {
  staffId: string;
  name: string;
  username: string;
  role: StaffRole;
  permissions: ModuleKey[];
  mustChangePin: boolean;
}

export type LoginOutcome = { ok: true; mustChangePin: boolean } | { ok: false; message: string };

interface AuthValue {
  session: Session | null;
  loading: boolean;
  online: boolean;
  can: (module: ModuleKey) => boolean;
  login: (username: string, pin: string) => Promise<LoginOutcome>;
  changePin: (currentPin: string, newPin: string) => Promise<ChangePinResult>;
  logout: () => Promise<void>;
  /** A fresh ID token for server functions that act as the signed-in person. */
  idToken: () => Promise<string>;
}

const AuthContext = createContext<AuthValue | null>(null);

const LOGIN_MESSAGES: Record<string, string> = {
  invalid: "That username and PIN don't match.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  unavailable: "Couldn't reach the server. Check the connection and try again.",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    return onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setSession(null);
        setLoading(false);
        return;
      }
      try {
        const { claims } = await user.getIdTokenResult();
        const role = isStaffRole(claims.role) ? claims.role : null;
        setSession(
          role
            ? {
                staffId: user.uid,
                name: typeof claims.name === "string" ? claims.name : "Staff",
                username: typeof claims.username === "string" ? claims.username : "",
                role,
                permissions: sanitizePermissions(claims.perms),
                mustChangePin: claims.mcp === true,
              }
            : null,
        );
      } catch {
        setSession(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const login = useCallback(async (username: string, pin: string): Promise<LoginOutcome> => {
    let result;
    try {
      result = await loginFn({ data: { username, pin } });
    } catch {
      return { ok: false, message: LOGIN_MESSAGES.unavailable! };
    }
    if (!result.success) {
      if (result.error === "locked") {
        return {
          ok: false,
          message: `Too many wrong PINs. This account is locked for ${result.minutes ?? 5} minutes.`,
        };
      }
      return { ok: false, message: LOGIN_MESSAGES[result.error] ?? LOGIN_MESSAGES.invalid! };
    }
    try {
      await signInWithCustomToken(auth, result.customToken);
    } catch {
      return { ok: false, message: LOGIN_MESSAGES.unavailable! };
    }
    return { ok: true, mustChangePin: result.mustChangePin };
  }, []);

  const idToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in");
    return user.getIdToken();
  }, []);

  const changePin = useCallback(
    async (currentPin: string, newPin: string): Promise<ChangePinResult> => {
      const result = await changeOwnPinFn({
        data: { idToken: await idToken(), currentPin, newPin },
      });
      // Sign in again so the new token no longer carries the change-PIN flag.
      if (result.success && session?.username) await login(session.username, newPin);
      return result;
    },
    [idToken, login, session?.username],
  );

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      online,
      can: (m) => hasModule(session?.role, session?.permissions, m),
      login,
      changePin,
      logout,
      idToken,
    }),
    [session, loading, online, login, changePin, logout, idToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
