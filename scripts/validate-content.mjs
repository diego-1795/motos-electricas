#!/usr/bin/env node
/**
 * Validador rápido del catálogo (git como CMS). Fase 12 del roadmap.
 * El build ya valida los esquemas zod (content collections); este script añade
 * en segundos, y sin build completo, las reglas de INTEGRIDAD entre ficheros:
 *  - referencias cruzadas (related, accessories, compatibleWith, relatedProducts)
 *  - slugs/ids únicos y coherentes con el nombre de fichero
 *  - imágenes referenciadas existentes en src/assets
 *  - moneda PEN, precios enteros positivos, exactamente una variante por defecto
 *  - coherencia batería (capacityKwh ≈ V·Ah/1000) y licencia vs. velocidad
 * Uso: npm run validate:content (falla con exit 1 y lista de errores).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = 'src/content';
const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);

const load = (dir) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = join(ROOT, dir, f);
      try {
        return { file, name: basename(f, '.json'), data: JSON.parse(readFileSync(file, 'utf8')) };
      } catch (e) {
        err(file, `JSON inválido: ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);

const products = load('products');
const accessories = load('accessories');
const categories = load('categories');
const blogFiles = readdirSync(join(ROOT, 'blog')).filter((f) => f.endsWith('.md'));

const productSlugs = new Set(products.map((p) => p.data.slug));
const accessorySlugs = new Set(accessories.map((a) => a.data.slug));
const categorySlugs = new Set(categories.map((c) => c.data.slug));

const checkImage = (file, ref) => {
  if (!ref?.src) return;
  if (ref.src.startsWith('~/')) {
    const p = join('src', ref.src.slice(2));
    if (!existsSync(p)) err(file, `imagen no encontrada: ${ref.src}`);
  }
  if (!ref.alt && ref.alt !== '') err(file, `imagen sin alt: ${ref.src}`);
};

const checkMoney = (file, m, label) => {
  if (!m) return;
  if (m.currency !== 'PEN') err(file, `${label}: moneda debe ser PEN`);
  if (!Number.isInteger(m.amount) || m.amount < 0) err(file, `${label}: amount debe ser entero ≥ 0 (céntimos de sol)`);
};

for (const { file, name, data: p } of products) {
  if (p.slug !== name) err(file, `slug "${p.slug}" no coincide con el nombre de fichero`);
  for (const r of p.related ?? []) if (!productSlugs.has(r)) err(file, `related desconocido: ${r}`);
  for (const a of p.accessories ?? []) if (!accessorySlugs.has(a)) err(file, `accesorio desconocido: ${a}`);
  if (!categorySlugs.has(p.category)) err(file, `categoría desconocida: ${p.category}`);
  for (const img of p.images ?? []) checkImage(file, img);
  const defaults = (p.variants ?? []).filter((v) => v.isDefault);
  if (defaults.length !== 1) err(file, `debe haber exactamente 1 variante isDefault (hay ${defaults.length})`);
  for (const v of p.variants ?? []) checkMoney(file, v.price, `variante ${v.id}`);
  for (const c of p.colors ?? []) checkMoney(file, c.priceDelta, `color ${c.id}`);
  const b = p.specs?.battery;
  if (b) {
    const kwh = (b.voltage * b.capacityAh) / 1000;
    if (Math.abs(kwh - b.capacityKwh) > 0.05) err(file, `capacityKwh ${b.capacityKwh} ≠ V·Ah/1000 (${kwh.toFixed(2)})`);
  }
  if (p.specs?.license === 'sin-licencia' && p.specs.topSpeedKmh > 32)
    err(file, `"sin-licencia" con ${p.specs.topSpeedKmh} km/h: revisar con el asesor legal (MTC)`);
}

for (const { file, name, data: a } of accessories) {
  if (a.slug !== name) err(file, `slug "${a.slug}" no coincide con el nombre de fichero`);
  checkMoney(file, a.price, 'price');
  checkImage(file, a.image);
  for (const c of a.compatibleWith ?? []) if (!productSlugs.has(c)) err(file, `compatibleWith desconocido: ${c}`);
}

const heroCount = products.filter((p) => p.data.isHero).length;
if (heroCount !== 1) errors.push(`products: debe haber exactamente 1 producto isHero (hay ${heroCount})`);

for (const f of blogFiles) {
  const file = join(ROOT, 'blog', f);
  const src = readFileSync(file, 'utf8');
  const m = src.match(/relatedProducts:\s*\[([^\]]*)\]|relatedProducts:\n((?:\s+-\s+.+\n)+)/);
  const slugs = m
    ? (m[1] ? m[1].split(',') : m[2].split('\n').map((l) => l.replace(/^\s*-\s*/, '')))
        .map((s) => s.replace(/['"\s]/g, ''))
        .filter(Boolean)
    : [];
  for (const s of slugs) if (!productSlugs.has(s)) err(file, `relatedProducts desconocido: ${s}`);
  if (/€|EUR|carnet|\bIVA\b/.test(src)) err(file, 'contiene referencias a España/EUR (usar S/, IGV, licencia)');
}

if (errors.length) {
  console.error(`✘ ${errors.length} error(es) de contenido:\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ Contenido válido: ${products.length} productos, ${accessories.length} accesorios, ${categories.length} categorías, ${blogFiles.length} artículos`);
