import { useStore } from '@nanostores/preact';
import { useEffect, useState } from 'preact/hooks';
import { $cart, $cartTotal, clearCart, removeFromCart, setNotes, setQuantity } from '../stores/cart';
import { formatMoney } from '../domain/money';
import { lineTotal } from '../domain/cart';
import { site } from '../config/site';
import { buildMessage } from '../services/whatsapp/WhatsAppMessageBuilder';
import CartRequestButton from './CartRequestButton';

/** Página /carrito: revisión completa + notas + vista previa del mensaje. */
export default function CartPage() {
  const cart = useStore($cart);
  const total = useStore($cartTotal);
  // Raíz estable + render del estado real solo tras montar (SSR no conoce localStorage).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div class="cp" data-cart-page aria-busy="true" />;
  }

  if (cart.items.length === 0) {
    return (
      <div class="cp" data-cart-page>
      <div class="cp__empty card">
        <h2>Tu solicitud está vacía</h2>
        <p class="muted">Añade una moto desde el catálogo o deja que te recomendemos una.</p>
        <div class="cp__actions">
          <a href="/motos-electricas" class="btn btn--primary">Ver catálogo</a>
          <a href="/encuentra-tu-moto" class="btn btn--secondary">Encuentra tu moto</a>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div class="cp" data-cart-page>
      <section class="cp__items" aria-labelledby="cp-items">
        <h2 id="cp-items" class="visually-hidden">
          Artículos
        </h2>
        <ul role="list">
          {cart.items.map((i) => (
            <li key={i.key} class="cp__item card" data-cart-item>
              <div class="cp__thumb">{i.image && <img src={i.image.src} alt="" width="96" height="96" loading="lazy" />}</div>
              <div class="cp__info">
                <strong>{i.name}</strong>
                <small class="muted">{[i.variantName, i.colorName].filter(Boolean).join(' · ') || (i.kind === 'accessory' ? 'Accesorio' : '')}</small>
                <small class="muted">{formatMoney(i.unitPrice)} / ud.</small>
              </div>
              <div class="cp__controls">
                <div class="stepper" aria-label={`Cantidad de ${i.name}`}>
                  <button type="button" onClick={() => setQuantity(i.key, i.quantity - 1)} aria-label="Reducir cantidad">
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={site.maxQtyPerLine}
                    value={i.quantity}
                    aria-label="Cantidad"
                    onChange={(e) => setQuantity(i.key, Number((e.target as HTMLInputElement).value))}
                  />
                  <button type="button" onClick={() => setQuantity(i.key, i.quantity + 1)} aria-label="Aumentar cantidad">
                    +
                  </button>
                </div>
                <strong class="cp__line">{formatMoney(lineTotal(i))}</strong>
                <button type="button" class="btn btn--ghost btn--sm" onClick={() => removeFromCart(i.key)} data-cart-remove>
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" class="btn btn--ghost btn--sm" onClick={clearCart}>
          Vaciar solicitud
        </button>
      </section>

      <aside class="cp__summary card" aria-labelledby="cp-sum">
        <h2 id="cp-sum">Resumen</h2>
        <div class="cp__total">
          <span>Total estimado</span>
          <strong data-cart-total>{formatMoney(total)}</strong>
        </div>
        <label class="field">
          <span class="label">Notas para el asesor (opcional)</span>
          <textarea
            class="textarea"
            maxLength={500}
            placeholder="Ciudad de entrega, dudas sobre financiación, fecha deseada…"
            value={cart.notes}
            onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
          />
          <span class="hint">{cart.notes.length}/500</span>
        </label>
        <CartRequestButton source="cart" />
        <p class="hint">
          Al pulsar se abrirá WhatsApp con el mensaje preparado. No se realiza ningún pago en esta web; un asesor confirmará disponibilidad, transporte y condiciones.
        </p>
        <details class="accordion">
          <summary>Ver mensaje que se enviará</summary>
          <div>
            <pre class="cp__preview" data-message-preview>
              {buildMessage(cart)}
            </pre>
          </div>
        </details>
      </aside>
    </div>
  );
}
