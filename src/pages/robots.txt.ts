import type { APIRoute } from 'astro';
import { site } from '../config/site';

/** robots.txt generado en build para que el Sitemap apunte al dominio real (PUBLIC_SITE_URL). */
export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', 'Disallow: /carrito', 'Disallow: /comparar', '', `Sitemap: ${site.url}/sitemap-index.xml`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
