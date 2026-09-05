// Cart is namespaced by storeId in localStorage, so switching stores
// (via the dev selector, or by visiting a different subdomain) never
// mixes items from two different stores into one order.

export interface CartItem {
  productId: string;
  name: string;
  price: string;
  quantity: number;
}

function cartKey(storeId: string): string {
  return `konvert:cart:${storeId}`;
}

export function getCart(storeId: string): CartItem[] {
  try {
    const raw = window.localStorage.getItem(cartKey(storeId));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveCart(storeId: string, items: CartItem[]): void {
  try {
    window.localStorage.setItem(cartKey(storeId), JSON.stringify(items));
  } catch {
    // best-effort only
  }
}

export function addToCart(
  storeId: string,
  product: { id: string; name: string; price: string },
): CartItem[] {
  const items = getCart(storeId);
  const existing = items.find((item) => item.productId === product.id);
  const next = existing
    ? items.map((item) =>
        item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item,
      )
    : [...items, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
  saveCart(storeId, next);
  return next;
}

export function setQuantity(storeId: string, productId: string, quantity: number): CartItem[] {
  const items = getCart(storeId);
  const next =
    quantity <= 0
      ? items.filter((item) => item.productId !== productId)
      : items.map((item) => (item.productId === productId ? { ...item, quantity } : item));
  saveCart(storeId, next);
  return next;
}

export function clearCart(storeId: string): CartItem[] {
  saveCart(storeId, []);
  return [];
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
}
