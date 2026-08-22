import type { Cart, CartItem, Money } from './types';
import { multiply, sum } from './money';

/**
 * Reducer puro del carrito. Sin efectos, sin dependencia del store.
 * El store (nanostores) solo persiste el resultado.
 */

export const emptyCart = (): Cart => ({ items: [], notes: '', updatedAt: new Date(0).toISOString() });

export function itemKey(i: Pick<CartItem, 'kind' | 'slug' | 'variantId' | 'colorId'>): string {
  return i.kind === 'product'
    ? `product:${i.slug}:${i.variantId ?? ''}:${i.colorId ?? ''}`
    : `accessory:${i.slug}`;
}

export function clampQty(qty: number, max: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(max, Math.max(1, Math.floor(qty)));
}

export function addItem(cart: Cart, item: Omit<CartItem, 'key'>, maxQty: number, now = new Date()): Cart {
  const key = itemKey(item);
  const existing = cart.items.find((i) => i.key === key);
  const items = existing
    ? cart.items.map((i) => (i.key === key ? { ...i, quantity: clampQty(i.quantity + item.quantity, maxQty) } : i))
    : [...cart.items, { ...item, key, quantity: clampQty(item.quantity, maxQty) }];
  return { ...cart, items, updatedAt: now.toISOString() };
}

export function setQuantity(cart: Cart, key: string, quantity: number, maxQty: number, now = new Date()): Cart {
  if (quantity <= 0) return removeItem(cart, key, now);
  return {
    ...cart,
    items: cart.items.map((i) => (i.key === key ? { ...i, quantity: clampQty(quantity, maxQty) } : i)),
    updatedAt: now.toISOString(),
  };
}

export function removeItem(cart: Cart, key: string, now = new Date()): Cart {
  return { ...cart, items: cart.items.filter((i) => i.key !== key), updatedAt: now.toISOString() };
}

export function setNotes(cart: Cart, notes: string, now = new Date()): Cart {
  return { ...cart, notes: notes.slice(0, 500), updatedAt: now.toISOString() };
}

export function clearCart(now = new Date()): Cart {
  return { ...emptyCart(), updatedAt: now.toISOString() };
}

export function lineTotal(i: CartItem): Money {
  return multiply(i.unitPrice, i.quantity);
}

export function cartTotal(cart: Cart): Money {
  return sum(cart.items.map(lineTotal));
}

export function cartCount(cart: Cart): number {
  return cart.items.reduce((n, i) => n + i.quantity, 0);
}

/** Valida un carrito restaurado de almacenamiento (datos no confiables) */
export function sanitizeCart(raw: unknown, maxQty: number): Cart {
  if (!raw || typeof raw !== 'object') return emptyCart();
  const r = raw as Partial<Cart>;
  const items = Array.isArray(r.items)
    ? r.items
        .filter(
          (i): i is CartItem =>
            !!i &&
            typeof i === 'object' &&
            typeof (i as CartItem).slug === 'string' &&
            typeof (i as CartItem).name === 'string' &&
            ((i as CartItem).kind === 'product' || (i as CartItem).kind === 'accessory') &&
            typeof (i as CartItem).unitPrice?.amount === 'number',
        )
        .map((i) => ({ ...i, key: itemKey(i), quantity: clampQty(i.quantity, maxQty) }))
    : [];
  return {
    items,
    notes: typeof r.notes === 'string' ? r.notes.slice(0, 500) : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date(0).toISOString(),
  };
}
