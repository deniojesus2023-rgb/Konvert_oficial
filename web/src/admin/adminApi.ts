// Separate API client for the staff panel: every call carries the staff
// JWT. Deliberately not shared with the public storefront's `lib/api.ts`
// — different audience, different auth, kept apart on purpose.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export type StaffRole = "platform_admin" | "admin" | "manager";

export interface StaffUser {
  userId: string;
  email: string;
  role: StaffRole;
  accountId: string | null;
}

export interface StoreSummary {
  id: string;
  name: string;
  publicSlug: string;
  status: string;
}

export interface AdminCategory {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  active: boolean;
}

export interface AdminProduct {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  active: boolean;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "canceled";

export interface AdminOrder {
  id: string;
  storeId: string;
  status: OrderStatus;
  deliveryAddress: string;
  paymentMethod: "cash_on_delivery";
  total: string;
  createdAt: string;
}

export interface OrderList {
  items: AdminOrder[];
  page: number;
  pageSize: number;
  total: number;
}

export class AdminApiError extends Error {
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
    throw new AdminApiError(message, code);
  }
  return body.result.data as T;
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

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const adminApi = {
  login(email: string, password: string) {
    return trpcMutate<{ token: string; user: StaffUser }>("auth.login", { email, password }, null);
  },
  me(token: string) {
    return trpcQuery<StaffUser>("auth.me", undefined, token);
  },
  listMyStores(token: string) {
    return trpcQuery<StoreSummary[]>("stores.listMine", undefined, token);
  },

  listCategories(token: string, storeId: string) {
    return trpcQuery<AdminCategory[]>("categories.listAll", { storeId }, token);
  },
  createCategory(token: string, input: { storeId: string; name: string; slug?: string }) {
    return trpcMutate<AdminCategory>("categories.create", input, token);
  },
  updateCategory(
    token: string,
    input: { categoryId: string; storeId: string; name?: string; slug?: string },
  ) {
    return trpcMutate<AdminCategory>("categories.update", input, token);
  },
  deleteCategory(token: string, input: { categoryId: string; storeId: string }) {
    return trpcMutate<{ id: string; active: false }>("categories.delete", input, token);
  },

  listProducts(token: string, storeId: string) {
    return trpcQuery<AdminProduct[]>("products.listAll", { storeId }, token);
  },
  createProduct(
    token: string,
    input: {
      storeId: string;
      categoryId: string;
      name: string;
      description?: string;
      price: number;
      imageUrl?: string;
    },
  ) {
    return trpcMutate<AdminProduct>("products.create", input, token);
  },
  updateProduct(
    token: string,
    input: {
      productId: string;
      storeId: string;
      categoryId?: string;
      name?: string;
      description?: string | null;
      price?: number;
      imageUrl?: string | null;
      active?: boolean;
    },
  ) {
    return trpcMutate<AdminProduct>("products.update", input, token);
  },
  deleteProduct(token: string, input: { productId: string; storeId: string }) {
    return trpcMutate<{ id: string; active: false }>("products.delete", input, token);
  },

  listOrders(
    token: string,
    input: { storeId: string; status?: OrderStatus; page?: number; pageSize?: number },
  ) {
    return trpcQuery<OrderList>("orders.listAll", input, token);
  },
  updateOrderStatus(token: string, input: { orderId: string; storeId: string; status: OrderStatus }) {
    return trpcMutate<AdminOrder>("orders.updateStatus", input, token);
  },

  getSettings(token: string, storeId: string) {
    return trpcQuery<Record<string, string>>("storeSettings.getAdmin", { storeId }, token);
  },
  setSetting(token: string, input: { storeId: string; key: string; value: string }) {
    return trpcMutate<{ key: string; value: string }>("storeSettings.set", input, token);
  },
};
