import type { AdminRole, PartPatch, ProductPatch } from './admin';
import type { Part, Product } from './types';

/**
 * Política de roles del panel (ADR-018). Pura: la aplican las Pages Functions
 * (nunca solo la interfaz). El editor (Wiliam) únicamente puede cambiar precios y
 * ocultar/mostrar; el admin (Diego) puede todo.
 */

/** `blog` (leer y escribir artículos) y `upload` (subir webp/PDF) son de administrador (ADR-023). */
export type Operation = 'read' | 'patch' | 'put' | 'delete' | 'blog' | 'upload';

const PERMISSIONS: Record<AdminRole, readonly Operation[]> = {
  admin: ['read', 'patch', 'put', 'delete', 'blog', 'upload'],
  editor: ['read', 'patch'],
};

export function canPerform(role: AdminRole, op: Operation): boolean {
  return PERMISSIONS[role].includes(op);
}

/** "a@x.com, B@y.com;c@z.com" → ['a@x.com','b@y.com','c@z.com'] */
export function parseEmailList(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

/** Rol de un email según las listas de configuración; admin prevalece. null = sin acceso al panel. */
export function resolveRole(email: string | undefined | null, lists: { admins: string[]; editors: string[] }): AdminRole | null {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return null;
  if (lists.admins.includes(e)) return 'admin';
  if (lists.editors.includes(e)) return 'editor';
  return null;
}

export type PatchResult<T> = { ok: true; value: T; changes: string[] } | { ok: false; errors: string[] };

const PRODUCT_PATCH_KEYS = new Set(['sha', 'reason', 'hidden', 'prices']);
const PART_PATCH_KEYS = new Set(['sha', 'reason', 'hidden', 'price']);

function unknownKeys(body: object, allowed: Set<string>): string[] {
  return Object.keys(body).filter((k) => !allowed.has(k)).map((k) => `campo no permitido en PATCH: ${k}`);
}

function priceErrors(amount: unknown, label: string): string[] {
  if (typeof amount !== 'number' || !Number.isInteger(amount)) return [`${label}: el precio debe ser un entero en céntimos de sol`];
  if (amount <= 0) return [`${label}: el precio debe ser mayor que 0`];
  return [];
}

/**
 * Aplica un ProductPatch sobre la ficha actual. Solo toca `variants[].price.amount` y `hidden`;
 * cualquier otra clave o un variantId desconocido se rechaza. Devuelve una copia (no muta).
 */
export function applyProductPatch(original: Product, patch: ProductPatch): PatchResult<Product> {
  const errors = unknownKeys(patch, PRODUCT_PATCH_KEYS);
  const changes: string[] = [];
  if (patch.hidden !== undefined && typeof patch.hidden !== 'boolean') errors.push('hidden debe ser booleano');
  const prices = patch.prices ?? {};
  if (patch.prices !== undefined && (typeof prices !== 'object' || prices === null || Array.isArray(prices))) errors.push('prices debe ser un objeto variantId → céntimos');
  for (const [id, amount] of Object.entries(prices)) {
    if (!original.variants.some((v) => v.id === id)) errors.push(`variante desconocida: ${id}`);
    errors.push(...priceErrors(amount, `variante ${id}`));
  }
  if (errors.length) return { ok: false, errors };

  const variants = original.variants.map((v) => {
    // Solo claves propias: un id como "constructor" o "toString" no debe resolver por la cadena de prototipos.
    const amount = Object.hasOwn(prices, v.id) ? prices[v.id] : undefined;
    if (amount === undefined || amount === v.price.amount) return v;
    changes.push(`${v.name}: ${v.price.amount} → ${amount}`);
    return { ...v, price: { ...v.price, amount } };
  });
  const value: Product = { ...original, variants };
  if (patch.hidden !== undefined && patch.hidden !== (original.hidden ?? false)) {
    changes.push(patch.hidden ? 'ocultar' : 'mostrar');
  }
  if (patch.hidden === true) value.hidden = true;
  else if (patch.hidden === false) delete value.hidden;

  // La Premium nunca más barata que la Estándar (ADR-017), también desde el panel.
  const est = value.variants.find((v) => v.tier === 'estandar');
  const prem = value.variants.find((v) => v.tier === 'premium');
  if (est && prem && prem.price.amount < est.price.amount) {
    return { ok: false, errors: [`la versión Premium (${prem.price.amount}) no puede ser más barata que la Estándar (${est.price.amount})`] };
  }
  return { ok: true, value, changes };
}

export function applyPartPatch(original: Part, patch: PartPatch): PatchResult<Part> {
  const errors = unknownKeys(patch, PART_PATCH_KEYS);
  const changes: string[] = [];
  if (patch.hidden !== undefined && typeof patch.hidden !== 'boolean') errors.push('hidden debe ser booleano');
  if (patch.price !== undefined) errors.push(...priceErrors(patch.price, 'price'));
  if (errors.length) return { ok: false, errors };

  const value: Part = { ...original };
  if (patch.price !== undefined && patch.price !== original.price.amount) {
    changes.push(`precio: ${original.price.amount} → ${patch.price}`);
    value.price = { ...original.price, amount: patch.price };
  }
  if (patch.hidden !== undefined && patch.hidden !== (original.hidden ?? false)) changes.push(patch.hidden ? 'ocultar' : 'mostrar');
  if (patch.hidden === true) value.hidden = true;
  else if (patch.hidden === false) delete value.hidden;
  return { ok: true, value, changes };
}

export const MAX_REASON_LENGTH = 300;

/** Ámbito del commit: catálogo (productos/repuestos), blog o assets (subidas). */
export type CommitScope = 'catalog' | 'blog' | 'assets';

/** Mensaje de commit: `chore(<ámbito>): <acción> <slug> por <email>` + motivo y detalle en el cuerpo. */
export function commitMessage(
  action: 'actualizar' | 'crear' | 'borrar' | 'subir',
  slug: string,
  email: string,
  detail: { changes?: string[]; reason?: string } = {},
  scope: CommitScope = 'catalog',
): string {
  const body: string[] = [];
  // Cada cambio en una sola línea: un nombre de variante con saltos de línea no puede añadir trailers al commit
  const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  const changes = (detail.changes ?? []).map(oneLine).filter(Boolean);
  if (changes.length) body.push(changes.join('\n'));
  // Motivo acotado (texto libre del panel): una línea, sin control chars, máximo MAX_REASON_LENGTH.
  const reason = oneLine(detail.reason ?? '').slice(0, MAX_REASON_LENGTH);
  if (reason) body.push(`Motivo: ${reason}`);
  return `chore(${scope}): ${action} ${slug} por ${email}${body.length ? `\n\n${body.join('\n\n')}` : ''}`;
}
