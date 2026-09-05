import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { platformApi, type StaffUser } from "./platformApi";

// State for the platform (super-admin) panel only. There is no "selected
// store" concept here — platform_admin operates on accounts, or on the
// whole platform at once — and this context is never shared with the
// store admin panel's AdminStoreContext, a different audience entirely.

const TOKEN_KEY = "konvert:platform:token";

interface PlatformContextValue {
  token: string | null;
  user: StaffUser | null;
  loading: boolean;
  /** Set when a logged-in user's role isn't platform_admin — the layout shows a 403 for this. */
  forbidden: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    setUser(null);
    setForbidden(false);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const me = await platformApi.me(token);
        if (cancelled) return;
        setUser(me);
        setForbidden(me.role !== "platform_admin");
      } catch {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await platformApi.login(email, password);
    try {
      window.localStorage.setItem(TOKEN_KEY, result.token);
    } catch {
      // ignore
    }
    setToken(result.token);
  }, []);

  const value = useMemo<PlatformContextValue>(
    () => ({ token, user, loading, forbidden, login, logout }),
    [token, user, loading, forbidden, login, logout],
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }
  return ctx;
}
