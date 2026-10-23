import { configureAnalytics, consoleAdapter, dataLayerAdapter, noopAdapter, track, type WhatsAppSource } from '../services/analytics/AnalyticsService';

/**
 * Arranque de analítica en cliente. Ligero, sin trackers de terceros.
 * Selección del adapter por env PUBLIC_ANALYTICS: "console" | "datalayer" | (vacío → noop).
 * Cloudflare Web Analytics (cookieless) se añade como <script defer> solo si
 * PUBLIC_CF_BEACON_TOKEN está definido, sin tocar el código.
 */
export function initAnalytics(): void {
  const mode = import.meta.env.PUBLIC_ANALYTICS as string | undefined;
  configureAnalytics(mode === 'console' ? consoleAdapter : mode === 'datalayer' ? dataLayerAdapter : noopAdapter);

  track({ name: 'page_view', path: location.pathname });

  // Clicks de WhatsApp renderizados estáticamente (enlaces <a data-wa-source>)
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-wa-source]');
    if (!a) return;
    track({
      name: 'whatsapp_click',
      source: (a.dataset.waSource as WhatsAppSource | undefined) ?? 'footer',
      slug: a.dataset.waSlug,
    });
  });

  const token = import.meta.env.PUBLIC_CF_BEACON_TOKEN as string | undefined;
  if (token) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.dataset.cfBeacon = JSON.stringify({ token });
    document.body.appendChild(s);
  }
}
