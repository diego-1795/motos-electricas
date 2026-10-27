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

/**
 * Importe escrito a mano en soles → céntimos enteros (panel de administración, ADR-018).
 * Admite "1200", "1,200", "1200.50", "1,200.50" y un prefijo "S/" o "S/." opcional; coma solo como
 * separador de miles (grupos de 3) y punto como decimal, con 2 decimales como máximo.
 * Devuelve null si no es un importe válido (vacío, negativo, letras, 3 decimales, "1,20"…) o si
 * los céntimos no caben en un entero seguro (Number.MAX_SAFE_INTEGER).
 */
export function parseSoles(input: string): number | null {
  const s = input.trim().replace(/^S\/\.?\s*/i, '');
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const int = Number(m[1]!.replace(/,/g, ''));
  const dec = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  const cents = int * 100 + dec;
  return Number.isSafeInteger(cents) ? cents : null;
}
