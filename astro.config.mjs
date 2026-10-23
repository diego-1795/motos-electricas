// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

// Salida estática: portable a Cloudflare Pages, Vercel, Netlify, S3 o Nginx sin cambios.
// Si en el futuro se necesita SSR, añadir únicamente un adapter aquí.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://voltia.example.com',
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    preact({ compat: false }),
    sitemap({
      filter: (page) => !page.includes('/carrito') && !page.includes('/comparar') && !page.includes('/dev'),
      changefreq: 'weekly',
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
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
