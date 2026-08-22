import { useStore } from '@nanostores/preact';
import { useEffect, useState } from 'preact/hooks';
import { $cartCount, openCart } from '../stores/cart';

export default function CartButton() {
  const live = useStore($cartCount);
  // Evita mismatch de hidratación: el SSR no conoce localStorage.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? live : 0;
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
    </button>
  );
}
