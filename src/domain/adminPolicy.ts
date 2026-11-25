import type { AdminRole, PartPatch, ProductPatch } from './admin';
import { isUsername, normalizeUsername } from './adminAuth';
import type { Part, Product } from './types';
import { partSpecsChanges, partSpecsErrors, specsChanges } from './specsEdit';
import { stockErrors } from './stock';

/**
 * Política de roles del panel (ADR-018, ADR-025, ADR-026). Pura: la aplican las Pages Functions
 * (nunca solo la interfaz). El editor (p. ej. `william`; puede haber varios, ADR-034) cambia precios, oculta/muestra y gestiona el
 * blog sin tocar sus fotos; el admin (`admin`) puede todo, incluido restablecer la contraseña de otros.
 */

/**
 * `blog` (leer, crear, editar y borrar artículos) es de los dos roles (ADR-026); `blogImage`
 * (poner, cambiar o quitar la foto de un artículo) y `upload` (subir PDF) son de administrador
 * (ADR-023), igual que `users` (restablecer la contraseña de otro usuario, ADR-025).
 */
export type Operation = 'read' | 'patch' | 'put' | 'delete' | 'blog' | 'blogImage' | 'upload' | 'users';

const PERMISSIONS: Record<AdminRole, readonly Operation[]> = {
  admin: ['read', 'patch', 'put', 'delete', 'blog', 'blogImage', 'upload', 'users'],
  editor: ['read', 'patch', 'blog'],
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function canPerform(role: AdminRole, op: Operation): boolean {
  return PERMISSIONS[role].includes(op);
}

/** "admin, William;otro" → ['admin','william','otro'] (ADR-025). Lo que no sea un usuario válido se descarta. */
export function parseUserList(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(/[\s,;]+/)
    .map(normalizeUsername)
    .filter(isUsername);
}

/** Rol de un usuario según las listas de configuración; admin prevalece. null = sin acceso al panel. */
export function resolveRole(username: string | undefined | null, lists: { admins: string[]; editors: string[] }): AdminRole | null {
  const e = normalizeUsername(username);
  if (!e) return null;
  if (lists.admins.includes(e)) return 'admin';
  if (lists.editors.includes(e)) return 'editor';
  return null;
}

export type PatchResult<T> = { ok: true; value: T; changes: string[] } | { ok: false; errors: string[] };

// specs / variantSpecs / specs (repuestos): especificaciones, también para el editor (ADR-032)
// stock: unidades (ADR-035), también para el editor
const PRODUCT_PATCH_KEYS = new Set(['sha', 'reason', 'hidden', 'prices', 'specs', 'variantSpecs', 'stock']);
const PART_PATCH_KEYS = new Set(['sha', 'reason', 'hidden', 'price', 'specs', 'stock']);

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

  // Stock por versión (ADR-035): número entero ≥ 0, o null para dejar de controlarlo
  if (patch.stock !== undefined) {
    if (!isPlainObject(patch.stock)) return { ok: false, errors: ['stock debe ser un objeto variantId → unidades'] };
    const st = patch.stock;
    const errs: string[] = [];
    for (const [id, n] of Object.entries(st)) {
      if (!original.variants.some((v) => v.id === id)) errs.push(`variante desconocida: ${id}`);
      errs.push(...stockErrors(n, `variante ${id}`));
    }
    if (errs.length) return { ok: false, errors: errs };
    value.variants = value.variants.map((v) => {
      if (!Object.hasOwn(st, v.id)) return v;
      const n = st[v.id];
      if ((n ?? undefined) === v.stock) return v;
      changes.push(`stock ${v.name}: ${v.stock ?? 'sin control'} → ${n ?? 'sin control'}`);
      const { stock: _old, ...rest } = v;
      return n === null || n === undefined ? rest : { ...rest, stock: n };
    });
  }

  // Especificaciones (ADR-032): aquí solo la forma; el servidor valida después la ficha completa (esquema + reglas)
  if (patch.specs !== undefined) {
    if (!isPlainObject(patch.specs)) return { ok: false, errors: ['specs debe ser un objeto'] };
    const c = specsChanges(original.specs, patch.specs);
    if (c.length) {
      changes.push(`especificaciones: ${c.join(', ')}`);
      value.specs = patch.specs;
    }
  }
  if (patch.variantSpecs !== undefined) {
    if (!isPlainObject(patch.variantSpecs)) return { ok: false, errors: ['variantSpecs debe ser un objeto variantId → cambios'] };
    const vs = patch.variantSpecs;
    const unknown = Object.keys(vs).filter((id) => !original.variants.some((v) => v.id === id));
    if (unknown.length) return { ok: false, errors: unknown.map((id) => `variante desconocida: ${id}`) };
    value.variants = value.variants.map((v) => {
      if (!Object.hasOwn(vs, v.id)) return v;
      const next = vs[v.id];
      if (next !== null && !isPlainObject(next)) return v;
      const c = specsChanges(v.specsOverride, next ?? undefined);
      if (!c.length) return v;
      changes.push(`especificaciones de ${v.name}: ${c.join(', ')}`);
      const { specsOverride: _old, ...rest } = v;
      return next ? { ...rest, specsOverride: next } : rest;
    });
    if (Object.values(vs).some((o) => o !== null && !isPlainObject(o))) return { ok: false, errors: ['variantSpecs: cada versión debe ser un objeto o null'] };
  }

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
  // Stock (ADR-035): número entero ≥ 0, o null para dejar de controlarlo
  if (patch.stock !== undefined) {
    const errs = stockErrors(patch.stock, 'stock');
    if (errs.length) return { ok: false, errors: errs };
    const n = patch.stock ?? undefined;
    if (n !== original.stock) {
      changes.push(`stock: ${original.stock ?? 'sin control'} → ${n ?? 'sin control'}`);
      if (n === undefined) delete value.stock;
      else value.stock = n;
    }
  }
  // Especificaciones (ADR-032): lista completa; [] las quita
  if (patch.specs !== undefined) {
    if (!Array.isArray(patch.specs) || !patch.specs.every((s) => isPlainObject(s) && typeof s.label === 'string' && typeof s.value === 'string' && Object.keys(s).length === 2)) {
      return { ok: false, errors: ['specs debe ser una lista de { label, value }'] };
    }
    const errs = partSpecsErrors(patch.specs);
    if (errs.length) return { ok: false, errors: errs };
    if (partSpecsChanges(original.specs, patch.specs).length) {
      changes.push('especificaciones');
      if (patch.specs.length) value.specs = patch.specs;
      else delete value.specs;
    }
  }
  return { ok: true, value, changes };
}

export const MAX_REASON_LENGTH = 300;

/** Ámbito del commit: catálogo (productos/repuestos), blog o assets (subidas). */
export type CommitScope = 'catalog' | 'blog' | 'assets';

/** Mensaje de commit: `chore(<ámbito>): <acción> <slug> por <usuario>` + motivo y detalle en el cuerpo. */
export function commitMessage(
  action: 'actualizar' | 'crear' | 'borrar' | 'subir',
  slug: string,
  username: string,
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
  return `chore(${scope}): ${action} ${slug} por ${username}${body.length ? `\n\n${body.join('\n\n')}` : ''}`;
}
