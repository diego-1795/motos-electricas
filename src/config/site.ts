/**
 * Configuración centralizada del sitio.
 * Única fuente de verdad para marca, contacto y parámetros comerciales.
 * Nunca hardcodear estos valores en componentes.
 */
export const site = {
  name: 'Voltia',
  tagline: 'Digital Electric Mobility Showroom',
  description:
    'Showroom digital de motos eléctricas: scooters, motos, bicimotos, trimotos y vehículos de carga. Compara, configura y solicita tu compra por WhatsApp.',
  url: import.meta.env.PUBLIC_SITE_URL ?? 'https://voltia.example.com',
  locale: 'es-ES',
  lang: 'es',
  currency: 'EUR',
  country: 'ES',
  /** Número en formato internacional sin "+", p.ej. 34600000000 */
  whatsappNumber: (import.meta.env.PUBLIC_WHATSAPP_NUMBER as string | undefined) ?? '34600000000',
  contactEmail: (import.meta.env.PUBLIC_CONTACT_EMAIL as string | undefined) ?? 'hola@voltia.example.com',
  social: {
    instagram: 'https://instagram.com/voltia',
    tiktok: 'https://tiktok.com/@voltia',
    youtube: 'https://youtube.com/@voltia',
  },
  /** Máximo de modelos en el comparador */
  compareLimit: 3,
  /** Máximo de unidades por línea de carrito */
  maxQtyPerLine: 10,
  /** Versión del esquema de carrito persistido (invalida datos antiguos) */
  cartStorageKey: 'voltia:cart:v1',
  compareStorageKey: 'voltia:compare:v1',
} as const;

export type SiteConfig = typeof site;
