import type { Cart, CartItem, WhatsAppRequest } from '../../domain/types';
import { cartTotal } from '../../domain/cart';
import { formatMoney } from '../../domain/money';

/**
 * Único punto del sistema que construye mensajes y enlaces de WhatsApp.
 * Los componentes NUNCA montan el texto ni el número por su cuenta.
 */

export interface WhatsAppBuilderOptions {
  /** Número internacional sin "+" */
  phone: string;
  greeting?: string;
  closing?: string;
}

const DEFAULT_GREETING = 'Hola 👋\nEstoy interesado en realizar el siguiente pedido:';
const DEFAULT_CLOSING = '¿Podéis confirmarme disponibilidad y condiciones de compra?';

const ICON: Record<CartItem['kind'], string> = { product: '🏍️', accessory: '🧩' };

function accessoryIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('bater')) return '🔋';
  if (n.includes('casco')) return '🪖';
  if (n.includes('carga')) return '🔌';
  if (n.includes('baúl') || n.includes('baul') || n.includes('maleta')) return '🧳';
  if (n.includes('candado') || n.includes('alarma')) return '🔒';
  return ICON.accessory;
}

/** Evita que el usuario inyecte saltos o marcado raro en las notas */
export function sanitizeNotes(notes: string): string {
  return notes
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
    .slice(0, 500);
}

export function formatItem(item: CartItem): string {
  const icon = item.kind === 'product' ? ICON.product : accessoryIcon(item.name);
  const lines = [`${icon} ${item.name}`];
  if (item.variantName) lines.push(`Variante: ${item.variantName}`);
  if (item.colorName) lines.push(`Color: ${item.colorName}`);
  lines.push(`Cantidad: ${item.quantity}`);
  return lines.join('\n');
}

export function buildMessage(cart: Cart, opts: Pick<WhatsAppBuilderOptions, 'greeting' | 'closing'> = {}): string {
  const blocks: string[] = [opts.greeting ?? DEFAULT_GREETING];
  const products = cart.items.filter((i) => i.kind === 'product');
  const accessories = cart.items.filter((i) => i.kind === 'accessory');
  for (const i of [...products, ...accessories]) blocks.push(formatItem(i));
  blocks.push(`💰 Total estimado: ${formatMoney(cartTotal(cart))}`);
  const notes = sanitizeNotes(cart.notes ?? '');
  if (notes) blocks.push(`📝 Notas: ${notes}`);
  blocks.push(opts.closing ?? DEFAULT_CLOSING);
  return blocks.join('\n\n');
}

/** Mensaje corto para "Consultar por WhatsApp" desde una ficha de producto */
export function buildInquiryMessage(productName: string, variantName?: string): string {
  const v = variantName ? ` (${variantName})` : '';
  return `Hola 👋\nMe interesa el modelo ${productName}${v}. ¿Podéis darme más información sobre disponibilidad, precio y condiciones de compra?`;
}

export function buildUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildRequest(cart: Cart, opts: WhatsAppBuilderOptions): WhatsAppRequest {
  const message = buildMessage(cart, opts);
  return { phone: opts.phone, message, url: buildUrl(opts.phone, message) };
}
