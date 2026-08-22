#!/usr/bin/env node
/**
 * Presupuestos de rendimiento (docs/09-performance.md). Se ejecuta sobre dist/ tras el build.
 * Mide el gzip de todos los JS/CSS que una página carga (incluidos imports dinámicos del grafo).
 */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const BUDGETS = {
  '/': { js: 30, css: 12, html: 20 },
  '/motos-electricas': { js: 30, css: 12, html: 24 },
  '/motos-electricas/odin-1-0': { js: 60, css: 12, html: 24 },
  '/carrito': { js: 40, css: 12, html: 12 },
  '/comparar': { js: 40, css: 12, html: 16 },
  '/encuentra-tu-moto': { js: 45, css: 12, html: 20 },
};

const gz = (p) => gzipSync(readFileSync(p)).length / 1024;
const seen = new Set();
function collectJs(file, acc) {
  if (seen.has(file)) return;
  seen.add(file);
  acc.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\(?["']\.?\/?([^"']+\.js)["']\)?|from\s*["']\.?\/?([^"']+\.js)["']/g)) {
    const rel = m[1] ?? m[2];
    const target = join(DIST, '_astro', rel.replace(/^.*_astro\//, ''));
    if (existsSync(target)) collectJs(target, acc);
  }
}

let failed = false;
for (const [route, b] of Object.entries(BUDGETS)) {
  const html = join(DIST, route === '/' ? 'index.html' : `${route}/index.html`);
  const doc = readFileSync(html, 'utf8');
  seen.clear();
  const js = new Set();
  const css = new Set();
  for (const m of doc.matchAll(/\/_astro\/[^"']+\.(js|css)/g)) {
    const p = join(DIST, m[0]);
    if (!existsSync(p)) continue;
    if (m[1] === 'js') collectJs(p, js);
    else css.add(p);
  }
  const r = { js: [...js].reduce((s, f) => s + gz(f), 0), css: [...css].reduce((s, f) => s + gz(f), 0), html: gz(html) };
  const line = Object.entries(r).map(([k, v]) => `${k} ${v.toFixed(1)}/${b[k]}KB${v > b[k] ? ' ✘' : ''}`).join('  ');
  if (Object.keys(b).some((k) => r[k] > b[k])) failed = true;
  console.log(`${failed ? '✘' : '✓'} ${route.padEnd(28)} ${line}`);
}
process.exit(failed ? 1 : 0);
