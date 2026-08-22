import { describe, it, expect } from 'vitest';
import {
  addItem,
  cartCount,
  cartTotal,
  clampQty,
  clearCart,
  emptyCart,
  itemKey,
  lineTotal,
  removeItem,
  sanitizeCart,
  setNotes,
  setQuantity,
} from '../../src/domain/cart';
import { eur } from '../../src/domain/money';
import { accessoryItem, odinItem } from './fixtures';

const MAX = 10;
const NOW = new Date('2025-06-01T12:00:00.000Z');

describe('itemKey', () => {
  it('incluye variante y color para productos', () => {
    expect(itemKey(odinItem())).toBe('product:odin-1-0:bat-72v-50ah:negro-mate');
    expect(itemKey({ kind: 'product', slug: 'x' })).toBe('product:x::');
  });
  it('solo usa slug para accesorios', () => {
    expect(itemKey({ kind: 'accessory', slug: 'casco', variantId: 'ignored' })).toBe('accessory:casco');
  });
});

describe('clampQty', () => {
  it('limita a [1, max] y trunca decimales', () => {
    expect(clampQty(0, MAX)).toBe(1);
    expect(clampQty(-5, MAX)).toBe(1);
    expect(clampQty(11, MAX)).toBe(10);
    expect(clampQty(3.9, MAX)).toBe(3);
    expect(clampQty(7, MAX)).toBe(7);
  });
  it('devuelve 1 para valores no finitos', () => {
    expect(clampQty(NaN, MAX)).toBe(1);
    expect(clampQty(Infinity, MAX)).toBe(1);
  });
});

describe('addItem', () => {
  it('añade una línea nueva con key calculada y updatedAt', () => {
    const cart = addItem(emptyCart(), odinItem(), MAX, NOW);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.key).toBe('product:odin-1-0:bat-72v-50ah:negro-mate');
    expect(cart.items[0]!.quantity).toBe(1);
    expect(cart.updatedAt).toBe(NOW.toISOString());
  });

  it('fusiona la misma key sumando cantidades', () => {
    let cart = addItem(emptyCart(), odinItem({ quantity: 2 }), MAX);
    cart = addItem(cart, odinItem({ quantity: 3 }), MAX);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBe(5);
  });

  it('limita la suma a maxQty', () => {
    let cart = emptyCart();
    for (let i = 0; i < 12; i++) cart = addItem(cart, odinItem(), MAX);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBe(10);
  });

  it('variante o color distintos crean líneas distintas', () => {
    let cart = addItem(emptyCart(), odinItem(), MAX);
    cart = addItem(cart, odinItem({ variantId: 'bat-72v-40ah', variantName: 'Batería 72V 40Ah' }), MAX);
    cart = addItem(cart, odinItem({ colorId: 'rojo', colorName: 'Rojo' }), MAX);
    expect(cart.items).toHaveLength(3);
  });

  it('clampa la cantidad inicial de una línea nueva', () => {
    const cart = addItem(emptyCart(), odinItem({ quantity: 99 }), MAX);
    expect(cart.items[0]!.quantity).toBe(10);
    const zero = addItem(emptyCart(), odinItem({ quantity: 0 }), MAX);
    expect(zero.items[0]!.quantity).toBe(1);
  });

  it('no muta el carrito original', () => {
    const original = emptyCart();
    addItem(original, odinItem(), MAX);
    expect(original.items).toHaveLength(0);
  });
});

describe('setQuantity / removeItem', () => {
  const cart = addItem(addItem(emptyCart(), odinItem(), MAX), accessoryItem('casco', 'Casco', 10000), MAX);
  const key = cart.items[0]!.key;

  it('actualiza la cantidad con clamp', () => {
    expect(setQuantity(cart, key, 4, MAX).items[0]!.quantity).toBe(4);
    expect(setQuantity(cart, key, 50, MAX).items[0]!.quantity).toBe(10);
  });

  it('cantidad 0 o negativa elimina la línea', () => {
    expect(setQuantity(cart, key, 0, MAX).items.map((i) => i.key)).toEqual(['accessory:casco']);
    expect(setQuantity(cart, key, -1, MAX).items).toHaveLength(1);
  });

  it('removeItem elimina solo la key indicada; key inexistente no cambia nada', () => {
    expect(removeItem(cart, 'accessory:casco').items).toHaveLength(1);
    expect(removeItem(cart, 'nope').items).toHaveLength(2);
  });

  it('setQuantity con key inexistente deja las líneas intactas', () => {
    expect(setQuantity(cart, 'nope', 5, MAX).items).toEqual(cart.items);
  });
});

describe('setNotes / clearCart', () => {
  it('trunca las notas a 500 caracteres', () => {
    const cart = setNotes(emptyCart(), 'a'.repeat(600));
    expect(cart.notes).toHaveLength(500);
    expect(setNotes(emptyCart(), 'hola').notes).toBe('hola');
  });
  it('clearCart devuelve carrito vacío con updatedAt actual', () => {
    const cart = clearCart(NOW);
    expect(cart.items).toEqual([]);
    expect(cart.notes).toBe('');
    expect(cart.updatedAt).toBe(NOW.toISOString());
  });
});

describe('totales', () => {
  const cart = addItem(addItem(emptyCart(), odinItem({ quantity: 2 }), MAX), accessoryItem('casco', 'Casco', 12900, 3), MAX);

  it('lineTotal = precio × cantidad', () => {
    expect(lineTotal(cart.items[0]!)).toEqual(eur(1099800));
  });
  it('cartTotal suma líneas; cartCount suma unidades', () => {
    expect(cartTotal(cart)).toEqual(eur(1099800 + 38700));
    expect(cartCount(cart)).toBe(5);
  });
  it('carrito vacío → 0', () => {
    expect(cartTotal(emptyCart())).toEqual(eur(0));
    expect(cartCount(emptyCart())).toBe(0);
  });
});

describe('sanitizeCart', () => {
  it('devuelve carrito vacío para basura', () => {
    for (const raw of [null, undefined, 42, 'str', [], {}, { items: 'nope' }]) {
      const c = sanitizeCart(raw, MAX);
      expect(c.items).toEqual([]);
      expect(c.notes).toBe('');
      expect(c.updatedAt).toBe(new Date(0).toISOString());
    }
  });

  it('descarta ítems parciales o con kind inválido', () => {
    const raw = {
      items: [
        null,
        'x',
        { slug: 'a' },
        { slug: 'a', name: 'A', kind: 'product' }, // sin unitPrice
        { slug: 'a', name: 'A', kind: 'gift', unitPrice: { amount: 1 } },
        { slug: 'a', name: 'A', kind: 'product', unitPrice: { amount: '1' } },
        { slug: 'ok', name: 'OK', kind: 'accessory', unitPrice: { amount: 100, currency: 'EUR' }, quantity: 2 },
      ],
    };
    const c = sanitizeCart(raw, MAX);
    expect(c.items).toHaveLength(1);
    expect(c.items[0]!.slug).toBe('ok');
  });

  it('recalcula keys y clampa cantidades', () => {
    const raw = {
      items: [
        { ...odinItem({ quantity: 999 }), key: 'tampered' },
        { ...odinItem({ quantity: -3, colorId: 'rojo' }), key: 'x' },
        { ...accessoryItem('casco', 'Casco', 100, NaN as unknown as number) },
      ],
      notes: 'n'.repeat(600),
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    const c = sanitizeCart(raw, MAX);
    expect(c.items.map((i) => [i.key, i.quantity])).toEqual([
      ['product:odin-1-0:bat-72v-50ah:negro-mate', 10],
      ['product:odin-1-0:bat-72v-50ah:rojo', 1],
      ['accessory:casco', 1],
    ]);
    expect(c.notes).toHaveLength(500);
    expect(c.updatedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('notas y updatedAt no string se normalizan', () => {
    const c = sanitizeCart({ items: [], notes: 5, updatedAt: 7 }, MAX);
    expect(c.notes).toBe('');
    expect(c.updatedAt).toBe(new Date(0).toISOString());
  });
});
