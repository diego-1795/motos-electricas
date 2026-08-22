import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';
import type { Cart, CartItem } from '../domain/types';
import * as C from '../domain/cart';
import { site } from '../config/site';
import { track } from '../services/analytics/AnalyticsService';

/**
 * Store del carrito. Persistencia en localStorage (sin cuenta, sin datos sensibles).
 * Toda la lógica vive en domain/cart.ts; aquí solo se orquesta y persiste.
 * Para persistencia server-side futura: sustituir persistentAtom por un
 * atom sincronizado con CartRepository sin tocar componentes.
 */
export const $cart = persistentAtom<Cart>(site.cartStorageKey, C.emptyCart(), {
  encode: JSON.stringify,
  decode: (raw) => {
    try {
      return C.sanitizeCart(JSON.parse(raw), site.maxQtyPerLine);
    } catch {
      return C.emptyCart();
    }
  },
});

export const $cartCount = computed($cart, C.cartCount);
export const $cartTotal = computed($cart, C.cartTotal);

/** Drawer abierto/cerrado (no persistido) */
export const $cartOpen = atom(false);

export function addToCart(item: Omit<CartItem, 'key'>): void {
  $cart.set(C.addItem($cart.get(), item, site.maxQtyPerLine));
  track({ name: 'add_to_cart', slug: item.slug, kind: item.kind, quantity: item.quantity, value: item.unitPrice.amount * item.quantity });
  openCart();
}

export function setQuantity(key: string, qty: number): void {
  $cart.set(C.setQuantity($cart.get(), key, qty, site.maxQtyPerLine));
}

export function removeFromCart(key: string): void {
  $cart.set(C.removeItem($cart.get(), key));
}

export function setNotes(notes: string): void {
  $cart.set(C.setNotes($cart.get(), notes));
}

export function clearCart(): void {
  $cart.set(C.clearCart());
}

export function openCart(): void {
  const cart = $cart.get();
  track({ name: 'cart_open', items: C.cartCount(cart), value: C.cartTotal(cart).amount });
  $cartOpen.set(true);
}

export function closeCart(): void {
  $cartOpen.set(false);
}
