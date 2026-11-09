// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

// Misma lectura de .env que src/config/site.ts (import.meta.env), para que `site` (sitemap, Astro.site) y
// `site.url` (canónicas, OG, robots) nunca apunten a dominios distintos. Mismo valor por defecto que site.ts.
const { PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');

// Páginas fuera del sitemap: utilidades sin valor SEO, páginas legales (noindex), /dev y el panel /admin (ADR-018).
const SITEMAP_EXCLUDED = /\/(carrito|comparar|dev|admin|legal)(\/|$)/;

// Salida estática: portable a Cloudflare Pages, Vercel, Netlify, S3 o Nginx sin cambios.
// Si en el futuro se necesita SSR, añadir únicamente un adapter aquí.
export default defineConfig({
  site: PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://raiden.example.com',
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    preact({ compat: false }),
    sitemap({
      filter: (page) => !SITEMAP_EXCLUDED.test(new URL(page).pathname),
      changefreq: 'weekly',
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
    // `ruta.html` en vez de `ruta/index.html`: con trailingSlash 'never' los hosts estáticos (Cloudflare Pages,
    // Netlify, Vercel) sirven la URL canónica sin barra con 200 en lugar de redirigir a `ruta/` (ADR-024).
    format: 'file',
  },
  image: {
    // Sin CDN de imágenes externo: optimización en build (sharp) → AVIF/WebP.
    responsiveStyles: true,
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  vite: {
    build: {
      cssCodeSplit: true,
    },
  },
});
