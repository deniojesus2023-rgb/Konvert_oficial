import type { Category, Product } from "../lib/api";
import type { CartItem } from "../lib/cart";

interface MenuPageProps {
  categories: Category[];
  products: Product[];
  cart: CartItem[];
  onAddToCart: (product: Product) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onCheckout: () => void;
  cartCount: number;
  cartTotal: number;
}

export function MenuPage({
  categories,
  products,
  cart,
  onAddToCart,
  onSetQuantity,
  onCheckout,
  cartCount,
  cartTotal,
}: MenuPageProps) {
  const quantityOf = (productId: string) =>
    cart.find((item) => item.productId === productId)?.quantity ?? 0;

  return (
    <div className="menu-page">
      {categories.map((category) => {
        const categoryProducts = products.filter((p) => p.categoryId === category.id);
        if (categoryProducts.length === 0) return null;
        return (
          <section key={category.id} className="category">
            <h2>{category.name}</h2>
            <ul className="product-list">
              {categoryProducts.map((product) => {
                const quantity = quantityOf(product.id);
                return (
                  <li key={product.id} className="product-card">
                    {product.imageUrl && <img src={product.imageUrl} alt={product.name} />}
                    <div className="product-info">
                      <h3>{product.name}</h3>
                      {product.description && <p>{product.description}</p>}
                      <span className="price">R$ {Number(product.price).toFixed(2)}</span>
                    </div>
                    {quantity === 0 ? (
                      <button onClick={() => onAddToCart(product)}>Adicionar</button>
                    ) : (
                      <div className="quantity-control">
                        <button onClick={() => onSetQuantity(product.id, quantity - 1)}>-</button>
                        <span>{quantity}</span>
                        <button onClick={() => onSetQuantity(product.id, quantity + 1)}>+</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {products.length === 0 && <p>Nenhum produto disponível no momento.</p>}

      {cartCount > 0 && (
        <div className="cart-bar">
          <span>
            {cartCount} {cartCount === 1 ? "item" : "itens"} · R$ {cartTotal.toFixed(2)}
          </span>
          <button onClick={onCheckout}>Ver carrinho</button>
        </div>
      )}
    </div>
  );
}
