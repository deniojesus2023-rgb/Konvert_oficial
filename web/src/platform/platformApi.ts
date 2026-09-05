// API client for the Konvert super-admin panel (/platform/*). Kept
// entirely separate from the store admin panel's adminApi.ts: this one
// hits platform.* endpoints, which require role === "platform_admin" and
// have no notion of a "selected store" at all — only accounts.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export type StaffRole = "platform_admin" | "admin" | "manager";

export interface StaffUser {
  userId: string;
  email: string;
  role: StaffRole;
  accountId: string | null;
}

export type AccountPlan = "trial" | "basic" | "pro" | "enterprise";
export type AccountStatus = "active" | "suspended" | "canceled";

export interface Account {
  id: string;
  name: string;
  slug: string;
  plan: AccountPlan;
  status: AccountStatus;
  createdAt: string;
}

export interface AccountList {
  items: Account[];
  page: number;
  pageSize: number;
  total: number;
}

export interface StoreSummary {
  id: string;
  name: string;
  publicSlug: string;
  status: string;
}

export interface AccountDetail {
  account: Account;
  stores: StoreSummary[];
  metrics: { orderCount: number; revenue: string };
}

export interface GlobalMetrics {
  activeAccounts: number;
  totalStores: number;
  totalRevenue: string;
}

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok || body.error) {
    const message = body.error?.message ?? `Request failed with status ${res.status}`;
    const code = body.error?.data?.code ?? "UNKNOWN";
    throw new PlatformApiError(message, code);
  }
  return body.result.data as T;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function trpcQuery<T>(path: string, input: unknown, token: string | null): Promise<T> {
  const url = new URL(`${API_BASE_URL}/trpc/${path}`, window.location.origin);
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify(input));
  }
  const res = await fetch(url.toString(), { headers: authHeaders(token) });
  return handleResponse<T>(res);
}

async function trpcMutate<T>(path: string, input: unknown, token: string | null): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(input),
  });
  return handleResponse<T>(res);
}

export const platformApi = {
  login(email: string, password: string) {
    return trpcMutate<{ token: string; user: StaffUser }>("auth.login", { email, password }, null);
  },
  me(token: string) {
    return trpcQuery<StaffUser>("auth.me", undefined, token);
  },

  listAccounts(
    token: string,
    input: { search?: string; plan?: AccountPlan; status?: AccountStatus; page?: number },
  ) {
    return trpcQuery<AccountList>("platform.listAccounts", input, token);
  },
  getAccountDetail(token: string, accountId: string) {
    return trpcQuery<AccountDetail>("platform.getAccountDetail", { accountId }, token);
  },
  suspendAccount(token: string, input: { accountId: string; reason: string }) {
    return trpcMutate<Account>("platform.suspendAccount", input, token);
  },
  reactivateAccount(token: string, input: { accountId: string; reason: string }) {
    return trpcMutate<Account>("platform.reactivateAccount", input, token);
  },
  changeAccountPlan(token: string, input: { accountId: string; newPlan: AccountPlan }) {
    return trpcMutate<Account>("platform.changeAccountPlan", input, token);
  },
  getGlobalMetrics(token: string) {
    return trpcQuery<GlobalMetrics>("platform.getGlobalMetrics", undefined, token);
  },
  impersonateAccount(token: string, accountId: string) {
    return trpcMutate<{ token: string; expiresInMinutes: number }>(
      "platform.impersonateAccount",
      { accountId },
      token,
    );
  },
  endImpersonation(token: string, accountId: string) {
    return trpcMutate<{ ok: true }>("platform.endImpersonation", { accountId }, token);
  },
};
