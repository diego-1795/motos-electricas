/**
 * Configuración centralizada del sitio.
 * Única fuente de verdad para marca, contacto y parámetros comerciales.
 * Nunca hardcodear estos valores en componentes.
 */
export const site = {
  name: 'Raiden',
  tagline: 'Digital Electric Mobility Showroom',
  description:
    'Showroom digital de motos eléctricas en Perú: scooters, motos, bicimotos, trimotos y vehículos de carga. Compara, configura y solicita tu compra por WhatsApp.',
  url: import.meta.env.PUBLIC_SITE_URL ?? 'https://raiden.example.com',
  locale: 'es-PE',
  lang: 'es',
  currency: 'PEN',
  country: 'PE',
  /** Número en formato internacional sin "+", p.ej. 51987654321 (Perú) */
  whatsappNumber: (import.meta.env.PUBLIC_WHATSAPP_NUMBER as string | undefined) ?? '51987654321',
  contactEmail: (import.meta.env.PUBLIC_CONTACT_EMAIL as string | undefined) ?? 'hola@raiden.example.com',
  social: {
    instagram: 'https://instagram.com/raiden',
    tiktok: 'https://tiktok.com/@raiden',
    youtube: 'https://youtube.com/@raiden',
  },
  /** Máximo de modelos en el comparador */
  compareLimit: 3,
  /** Máximo de unidades por línea de carrito */
  maxQtyPerLine: 10,
  /** Versión del esquema de carrito persistido (invalida datos antiguos) */
  cartStorageKey: 'raiden:cart:v1',
  compareStorageKey: 'raiden:compare:v1',
} as const;

export type SiteConfig = typeof site;
