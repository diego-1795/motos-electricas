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
const DEFAULT_CLOSING = '¿Pueden confirmarme disponibilidad y condiciones de compra?';

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
  return `Hola 👋\nMe interesa el modelo ${productName}${v}. ¿Pueden darme más información sobre disponibilidad, precio y condiciones de compra?`;
}

/* ---------- Formulario de contacto (sin backend) ---------- */

export type ContactSubject = 'Compra' | 'Servicio técnico' | 'Repuestos' | 'Otro';
export const CONTACT_SUBJECTS: ContactSubject[] = ['Compra', 'Servicio técnico', 'Repuestos', 'Otro'];

export interface ContactFormData {
  name: string;
  phone: string;
  subject: ContactSubject;
  message: string;
}

/** Limpia un campo libre de una sola línea (nombre, teléfono) */
function cleanLine(s: string, max: number): string {
  return s
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Mensaje del formulario de /contacto. Mismo texto para WhatsApp y para mailto;
 * nunca se almacena: el usuario lo envía desde su propia app.
 */
export function buildContactMessage(d: ContactFormData): string {
  const subject = CONTACT_SUBJECTS.includes(d.subject) ? d.subject : 'Otro';
  const lines = [`Hola 👋 Soy ${cleanLine(d.name, 80) || 'un cliente'} y escribo desde la web.`, `Asunto: ${subject}`];
  const phone = cleanLine(d.phone, 24);
  if (phone) lines.push(`Teléfono: ${phone}`);
  const msg = sanitizeNotes(d.message);
  if (msg) lines.push(`Mensaje: ${msg}`);
  return lines.join('\n');
}

/** Mensaje de soporte para /servicio-tecnico (campos a rellenar por el cliente) */
export const SUPPORT_MESSAGE = 'Hola 👋 Necesito soporte técnico para mi bicimoto RAIDEN. Modelo: ___ . Problema: ___';

export function buildMailto(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildRequest(cart: Cart, opts: WhatsAppBuilderOptions): WhatsAppRequest {
  const message = buildMessage(cart, opts);
  return { phone: opts.phone, message, url: buildUrl(opts.phone, message) };
}
