import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Category, type CreatedOrder, type Product, type StoreBranding } from "./lib/api";
import { addToCart, cartTotal, clearCart, getCart, setQuantity, type CartItem } from "./lib/cart";
import { getSelectedStoreSlug, isLocalDev, setSelectedStoreSlug } from "./lib/storeResolution";
import { MenuPage } from "./pages/MenuPage";
import { CheckoutPage } from "./pages/CheckoutPage";

type View = "menu" | "checkout" | "confirmation";

export default function StorefrontApp() {
  const [store, setStore] = useState<StoreBranding | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [view, setView] = useState<View>("menu");
  const [lastOrder, setLastOrder] = useState<CreatedOrder | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slugInput, setSlugInput] = useState(getSelectedStoreSlug() ?? "");

  const loadStore = useCallback(async (opts: { slug?: string }) => {
    setLoadError(null);
    try {
      const branding = await api.getStoreBranding(opts.slug ? { slug: opts.slug } : {});
      setStore(branding);
      setCart(getCart(branding.id));
      const [cats, prods] = await Promise.all([
        api.listCategories(branding.id),
        api.listProducts(branding.id),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (err) {
      setStore(null);
      setCategories([]);
      setProducts([]);
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar a loja. Verifique o endereço.",
      );
    }
  }, []);

  useEffect(() => {
    if (isLocalDev()) {
      const saved = getSelectedStoreSlug();
      if (saved) void loadStore({ slug: saved });
    } else {
      void loadStore({});
    }
  }, [loadStore]);

  function handleLoadDevStore(event: React.FormEvent) {
    event.preventDefault();
    const slug = slugInput.trim();
    if (!slug) return;
    setSelectedStoreSlug(slug);
    void loadStore({ slug });
  }

  function handleAddToCart(product: Product) {
    if (!store) return;
    setCart(addToCart(store.id, product));
  }

  function handleSetQuantity(productId: string, quantity: number) {
    if (!store) return;
    setCart(setQuantity(store.id, productId, quantity));
  }

  async function handleConfirmOrder(deliveryAddress: string) {
    if (!store) return;
    setSubmitting(true);
    setCheckoutError(null);
    try {
      const order = await api.createOrder({
        storeId: store.id,
        items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        deliveryAddress,
        paymentMethod: "cash_on_delivery",
      });
      setCart(clearCart(store.id));
      setLastOrder(order);
      setView("confirmation");
    } catch (err) {
      setCheckoutError(
        err instanceof ApiError ? err.message : "Não foi possível enviar o pedido. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const total = cartTotal(cart);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      className="app"
      style={store?.primaryColor ? ({ "--brand-color": store.primaryColor } as React.CSSProperties) : undefined}
    >
      {isLocalDev() && (
        <form className="dev-bar" onSubmit={handleLoadDevStore}>
          <label htmlFor="dev-slug">Loja (dev):</label>
          <input
            id="dev-slug"
            value={slugInput}
            onChange={(event) => setSlugInput(event.target.value)}
            placeholder="slug da loja"
          />
          <button type="submit">Carregar</button>
        </form>
      )}

      <header className="store-header">
        {store?.logoUrl && <img src={store.logoUrl} alt={store.name} className="logo" />}
        <h1>{store?.name ?? "Konvert"}</h1>
      </header>

      {loadError && <p className="error">{loadError}</p>}

      {store && view === "menu" && (
        <MenuPage
          categories={categories}
          products={products}
          cart={cart}
          onAddToCart={handleAddToCart}
          onSetQuantity={handleSetQuantity}
          onCheckout={() => setView("checkout")}
          cartCount={cartCount}
          cartTotal={total}
        />
      )}

      {store && view === "checkout" && (
        <CheckoutPage
          cart={cart}
          total={total}
          onBack={() => setView("menu")}
          onConfirm={handleConfirmOrder}
          submitting={submitting}
          error={checkoutError}
        />
      )}

      {view === "confirmation" && lastOrder && (
        <div className="confirmation">
          <h2>Pedido confirmado!</h2>
          <p>
            Número do pedido: <strong>{lastOrder.id}</strong>
          </p>
          <p>Total: R$ {Number(lastOrder.total).toFixed(2)}</p>
          <p>Pagamento na entrega, em dinheiro.</p>
          <button
            onClick={() => {
              setLastOrder(null);
              setView("menu");
            }}
          >
            Voltar ao cardápio
          </button>
        </div>
      )}
    </div>
  );
}
