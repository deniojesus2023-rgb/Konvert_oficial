// Thin hand-rolled client for the Konvert tRPC API (no @trpc/client
// dependency): calls follow the plain, non-batched tRPC HTTP protocol —
// GET with a JSON `input` query param for queries, POST with a JSON body
// for mutations.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export interface StoreBranding {
  id: string;
  name: string;
  publicSlug: string;
  primaryColor: string | null;
  logoUrl: string | null;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  active: boolean;
}

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  storeId: string;
  items: CreateOrderItemInput[];
  deliveryAddress: string;
  paymentMethod: "cash_on_delivery";
}

export interface CreatedOrder {
  id: string;
  status: "pending";
  total: string;
}

class ApiError extends Error {
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
    throw new ApiError(message, code);
  }
  return body.result.data as T;
}

async function trpcQuery<T>(path: string, input?: unknown): Promise<T> {
  const url = new URL(`${API_BASE_URL}/trpc/${path}`, window.location.origin);
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify(input));
  }
  const res = await fetch(url.toString());
  return handleResponse<T>(res);
}

async function trpcMutate<T>(path: string, input: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleResponse<T>(res);
}

export const api = {
  getStoreBranding(input: { storeId?: string; slug?: string }): Promise<StoreBranding> {
    return trpcQuery("stores.getBySlugOrHost", Object.keys(input).length ? input : undefined);
  },
  listCategories(storeId: string): Promise<Category[]> {
    return trpcQuery("categories.list", { storeId });
  },
  listProducts(storeId: string): Promise<Product[]> {
    return trpcQuery("products.list", { storeId });
  },
  createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    return trpcMutate("orders.create", input);
  },
};

export { ApiError };
