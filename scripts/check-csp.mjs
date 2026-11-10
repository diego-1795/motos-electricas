#!/usr/bin/env node
/**
 * Comprueba que la CSP de public/_headers (copiada a dist/_headers) autoriza por hash sha256 TODOS los
 * scripts inline del build, y que vercel.json lleva exactamente los mismos hashes (docs/10-security.md §2).
 *
 * Astro inlina el runtime de islas y los <script> pequeños de componentes; sus hashes cambian al actualizar
 * Astro o al editar ese <script>. `astro preview` no aplica _headers, así que ni los e2e ni el navegador en
 * local detectan un hash desfasado: en producción el script quedaría bloqueado. Por eso este chequeo corre
 * tras cada `npm run build` (postbuild) y en CI.
 *
 *   - Global (`/*`): debe cubrir los scripts inline de todas las páginas salvo /admin.
 *   - `/admin` y `/admin/*`: su CSP propia debe cubrir los de dist/admin.html y dist/admin/**.
 *   - Avisa (sin fallar) de los hashes de la CSP que ya no usa ningún script.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
if (!existsSync(join(DIST, '_headers'))) {
  console.error('✘ No existe dist/_headers: ejecuta antes `npm run build`.');
  process.exit(1);
}

const hashesOf = (csp) => new Set([...csp.matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]));

/** Bloques de _headers: ruta → primera línea Content-Security-Policy con valor */
function cspByRoute(text) {
  const out = new Map();
  let route = null;
  for (const line of text.split('\n')) {
    if (/^\S/.test(line) && !line.startsWith('#')) route = line.trim();
    const m = line.match(/^\s+Content-Security-Policy:\s*(.+)$/);
    if (route && m && !out.has(route)) out.set(route, m[1]);
  }
  return out;
}

const routes = cspByRoute(readFileSync(join(DIST, '_headers'), 'utf8'));
const globalCsp = routes.get('/*');
const adminCsp = routes.get('/admin');
const adminSubCsp = routes.get('/admin/*');
if (!globalCsp || !adminCsp || !adminSubCsp) {
  console.error('✘ dist/_headers debe definir Content-Security-Policy para /*, /admin y /admin/*');
  process.exit(1);
}

/** hash → ejemplo "fichero :: inicio del script" */
function inlineScripts(files) {
  const found = new Map();
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
      if (/\bsrc=/.test(m[1]) || /ld\+json/.test(m[1])) continue;
      const hash = 'sha256-' + createHash('sha256').update(m[2], 'utf8').digest('base64');
      if (!found.has(hash)) found.set(hash, `${relative(DIST, file)} :: ${m[2].slice(0, 60).replace(/\s+/g, ' ')}`);
    }
  }
  return found;
}

function htmlFiles(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) htmlFiles(p, acc);
    else if (p.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const all = htmlFiles(DIST);
const isAdmin = (p) => /^admin(\.html$|\/)/.test(relative(DIST, p));
const errors = [];

function check(label, csp, files) {
  const allowed = hashesOf(csp);
  const used = inlineScripts(files);
  for (const [hash, where] of used) if (!allowed.has(hash)) errors.push(`${label}: falta '${hash}'  ← ${where}`);
  const stale = [...allowed].filter((h) => !used.has(h));
  return { allowed, used, stale };
}

const site = check('CSP global (/*)', globalCsp, all.filter((p) => !isAdmin(p)));
const admin = check('CSP de /admin', adminCsp, all.filter(isAdmin));
if (adminCsp !== adminSubCsp) errors.push('CSP de /admin y /admin/* deben ser idénticas en public/_headers');

// vercel.json: mismos hashes que _headers en la política global y en la de /admin
if (existsSync('vercel.json')) {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const cspOf = (source) => vercel.headers?.find((h) => h.source === source)?.headers?.find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  const same = (a, b) => a.size === b.size && [...a].every((h) => b.has(h));
  if (!same(hashesOf(cspOf('/(.*)')), site.allowed)) errors.push('vercel.json: los hashes de la CSP global no coinciden con public/_headers');
  if (!same(hashesOf(cspOf('/admin(.*)')), admin.allowed)) errors.push('vercel.json: los hashes de la CSP de /admin no coinciden con public/_headers');
}

if (errors.length) {
  console.error(`✘ CSP desfasada (${errors.length}):\n` + errors.map((e) => `  - ${e}`).join('\n'));
  console.error('\nActualiza los hashes en public/_headers (bloques /*, /admin y /admin/*) y en vercel.json, y vuelve a construir.');
  process.exit(1);
}
// Un hash del runtime solo usado en /admin sigue en la global a propósito (mismas islas): solo se avisa de los que nadie usa
const unused = site.stale.filter((h) => !admin.used.has(h));
if (unused.length) console.warn(`⚠ Hashes de la CSP global que ya no usa ningún script (se pueden retirar): ${unused.join(' ')}`);
console.log(`✓ CSP: ${site.used.size} scripts inline del sitio y ${admin.used.size} de /admin cubiertos por hash; vercel.json sincronizado`);
