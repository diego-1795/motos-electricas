#!/usr/bin/env node
/** Validación básica de JSON-LD en dist/ (fase 10). Complementa al validador de Google (manual). */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let pages = 0, blocks = 0;
const errs = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.html')) {
      pages++;
      const h = readFileSync(p, 'utf8');
      for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        blocks++;
        let o;
        try { o = JSON.parse(m[1].replace(/\\u003c/g, '<')); } catch { errs.push(`${p}: JSON inválido`); continue; }
        const t = o['@type'];
        if (!o['@context']) errs.push(`${p}: sin @context (${t})`);
        if (t === 'Product') {
          for (const k of ['name', 'offers', 'image']) if (!o[k]) errs.push(`${p}: Product sin ${k}`);
          const of = o.offers;
          if (of && of.priceCurrency !== 'PEN') errs.push(`${p}: priceCurrency ${of.priceCurrency}`);
          if (of && of['@type'] === 'AggregateOffer' && (!of.lowPrice || isNaN(+of.lowPrice))) errs.push(`${p}: lowPrice inválido`);
        }
        if (t === 'FAQPage' && (!o.mainEntity || !o.mainEntity.length)) errs.push(`${p}: FAQPage vacía`);
        if (t === 'BreadcrumbList' && o.itemListElement.some((i) => !i.item || !i.item.startsWith('http'))) errs.push(`${p}: breadcrumb sin URL absoluta`);
        if (t === 'Article' && (!o.headline || !o.datePublished)) errs.push(`${p}: Article incompleto`);
      }
    }
  }
})('dist');
if (errs.length) {
  console.error(`✘ ${errs.length} error(es) de JSON-LD:`);
  errs.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`✓ JSON-LD válido: ${pages} páginas, ${blocks} bloques`);
