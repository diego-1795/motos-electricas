import { useStore } from '@nanostores/preact';
import { $cartCount, openCart } from '../stores/cart';

export default function CartButton() {
  const count = useStore($cartCount);
  return (
    <button type="button" class="btn btn--ghost cart-btn" onClick={openCart} aria-label={`Abrir carrito, ${count} artículos`} data-cart-button>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6.3" />
        <circle cx="10" cy="20" r="1" />
        <circle cx="17" cy="20" r="1" />
      </svg>
      <span class="cart-btn__label">Carrito</span>
      {count > 0 && (
        <span class="cart-btn__count" data-cart-count>
          {count}
        </span>
      )}
      <style>{`
        .cart-btn{position:relative;gap:.5rem}
        .cart-btn__label{display:none}
        @media(min-width:1024px){.cart-btn__label{display:inline}}
        .cart-btn__count{position:absolute;top:2px;right:2px;min-width:1.125rem;height:1.125rem;padding-inline:.3rem;border-radius:999px;background:var(--accent);color:var(--accent-fg);font-size:.6875rem;font-weight:700;display:grid;place-items:center}
        @media(min-width:1024px){.cart-btn__count{position:static;margin-left:.25rem}}
      `}</style>
    </button>
  );
}
