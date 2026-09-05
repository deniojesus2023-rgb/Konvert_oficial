import { useState } from "react";
import type { CartItem } from "../lib/cart";

interface CheckoutPageProps {
  cart: CartItem[];
  total: number;
  onBack: () => void;
  onConfirm: (deliveryAddress: string) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

export function CheckoutPage({ cart, total, onBack, onConfirm, submitting, error }: CheckoutPageProps) {
  const [address, setAddress] = useState("");

  const canSubmit = address.trim().length > 0 && cart.length > 0 && !submitting;

  return (
    <div className="checkout-page">
      <button className="link-button" onClick={onBack}>
        ← Voltar ao cardápio
      </button>
      <h2>Confirmar pedido</h2>

      <ul className="cart-summary">
        {cart.map((item) => (
          <li key={item.productId}>
            <span>
              {item.quantity}× {item.name}
            </span>
            <span>R$ {(Number(item.price) * item.quantity).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="total">Total: R$ {total.toFixed(2)}</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onConfirm(address.trim());
        }}
      >
        <label htmlFor="address">Endereço de entrega</label>
        <textarea
          id="address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Rua, número, bairro, complemento"
          required
        />

        <fieldset>
          <legend>Forma de pagamento</legend>
          <label>
            <input type="radio" name="payment" checked readOnly /> Dinheiro na entrega
          </label>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={!canSubmit}>
          {submitting ? "Enviando..." : "Confirmar pedido"}
        </button>
      </form>
    </div>
  );
}
