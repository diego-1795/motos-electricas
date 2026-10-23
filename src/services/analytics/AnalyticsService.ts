/**
 * Analítica desacoplada del proveedor. La UI emite eventos de dominio;
 * el adapter decide a dónde van (noop, consola, dataLayer, Cloudflare…).
 * Nunca bloquea el render ni lanza excepciones hacia la UI.
 */

/** Origen de un clic a WhatsApp. 'contact' = formulario de /contacto; 'support' = /servicio-tecnico */
export type WhatsAppSource = 'cart' | 'product' | 'header' | 'footer' | 'floating' | 'contact' | 'support';

export type AnalyticsEvent =
  | { name: 'page_view'; path: string }
  | { name: 'product_view'; slug: string; category: string }
  | { name: 'add_to_cart'; slug: string; kind: 'product' | 'accessory'; quantity: number; value: number }
  | { name: 'cart_open'; items: number; value: number }
  | { name: 'purchase_request'; items: number; value: number; models: string[] }
  | { name: 'whatsapp_click'; source: WhatsAppSource; slug?: string }
  | { name: 'compare_add'; slug: string }
  | { name: 'finder_complete'; topSlug?: string }
  | { name: 'category_view'; category: string };

export interface AnalyticsAdapter {
  track(event: AnalyticsEvent & { device: 'mobile' | 'desktop' }): void;
}

export const noopAdapter: AnalyticsAdapter = { track: () => {} };

export const consoleAdapter: AnalyticsAdapter = {
  track: (e) => console.debug('[analytics]', e),
};

/** Compatible con GTM / cualquier tag manager: window.dataLayer.push */
export const dataLayerAdapter: AnalyticsAdapter = {
  track: (e) => {
    const w = globalThis as unknown as { dataLayer?: unknown[] };
    (w.dataLayer ??= []).push({ event: e.name, ...e });
  },
};

let adapter: AnalyticsAdapter = noopAdapter;

export function configureAnalytics(a: AnalyticsAdapter): void {
  adapter = a;
}

function device(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia?.('(max-width: 767px)').matches ? 'mobile' : 'desktop';
}

export function track(event: AnalyticsEvent): void {
  try {
    adapter.track({ ...event, device: device() });
  } catch {
    /* la analítica nunca rompe la UI */
  }
}
