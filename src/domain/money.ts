import type { Money } from './types';

/** Crea un importe en soles (céntimos). Nombre corto por ergonomía: `pen(499900)` = S/ 4,999 */
export const pen = (amount: number): Money => ({ amount, currency: 'PEN' });
/** @deprecated usar pen() */
export const eur = pen;

export const add = (a: Money, b: Money): Money => pen(a.amount + b.amount);

export const multiply = (m: Money, qty: number): Money => pen(m.amount * qty);

export const sum = (items: Money[]): Money => items.reduce(add, pen(0));

/**
 * Formato comercial peruano: "S/ 4,999" (sin decimales si es entero, "S/ 4,999.50" si no).
 * Se implementa a mano para no depender de los datos ICU de cada runtime
 * (Intl es-PE varía entre Node/navegadores en el símbolo y el espacio).
 */
export function formatMoney(m: Money): string {
  const soles = m.amount / 100;
  const [int, dec] = soles.toFixed(Number.isInteger(soles) ? 0 : 2).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `S/ ${grouped}${dec ? `.${dec}` : ''}`;
}
