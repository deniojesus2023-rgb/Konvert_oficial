import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { adminApi, type StaffUser, type StoreSummary } from "./adminApi";

// State for the staff panel only. Deliberately its own context, never
// shared with the public storefront's state (different audience, and a
// staff session token must never leak into the customer-facing app).

const TOKEN_KEY = "konvert:admin:token";
const SELECTED_STORE_KEY = "konvert:admin:selectedStoreId";

interface AdminStoreContextValue {
  token: string | null;
  user: StaffUser | null;
  stores: StoreSummary[];
  selectedStoreId: string | null;
  setSelectedStoreId: (id: string) => void;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminStoreContext = createContext<AdminStoreContextValue | null>(null);

export function AdminStoreProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<StaffUser | null>(null);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [selectedStoreId, setSelectedStoreIdState] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(SELECTED_STORE_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setSelectedStoreId = useCallback((id: string) => {
    setSelectedStoreIdState(id);
    try {
      window.localStorage.setItem(SELECTED_STORE_KEY, id);
    } catch {
      // best-effort only
    }
  }, []);

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    setUser(null);
    setStores([]);
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
        const me = await adminApi.me(token);
        const myStores = await adminApi.listMyStores(token);
        if (cancelled) return;
        setUser(me);
        setStores(myStores);
        setError(null);
        const stillValid = myStores.some((s) => s.id === selectedStoreId);
        if (!stillValid && myStores.length === 1) {
          setSelectedStoreId(myStores[0]!.id);
        }
      } catch {
        if (!cancelled) {
          logout();
          setError("Sessão expirada. Faça login novamente.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await adminApi.login(email, password);
    try {
      window.localStorage.setItem(TOKEN_KEY, result.token);
    } catch {
      // ignore
    }
    setToken(result.token);
  }, []);

  const value = useMemo<AdminStoreContextValue>(
    () => ({ token, user, stores, selectedStoreId, setSelectedStoreId, loading, error, login, logout }),
    [token, user, stores, selectedStoreId, setSelectedStoreId, loading, error, login, logout],
  );

  return <AdminStoreContext.Provider value={value}>{children}</AdminStoreContext.Provider>;
}

export function useAdminStore(): AdminStoreContextValue {
  const ctx = useContext(AdminStoreContext);
  if (!ctx) {
    throw new Error("useAdminStore must be used within an AdminStoreProvider");
  }
  return ctx;
}
