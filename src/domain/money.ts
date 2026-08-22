import type { Money } from './types';

export const eur = (amount: number): Money => ({ amount, currency: 'EUR' });

export const add = (a: Money, b: Money): Money => eur(a.amount + b.amount);

export const multiply = (m: Money, qty: number): Money => eur(m.amount * qty);

export const sum = (items: Money[]): Money => items.reduce(add, eur(0));

const formatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "4.999 €" — sin decimales para precios comerciales redondos; con ellos si aplica */
export function formatMoney(m: Money): string {
  const euros = m.amount / 100;
  if (Number.isInteger(euros)) return formatter.format(euros);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(euros);
}
