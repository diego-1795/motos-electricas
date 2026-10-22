/**
 * Configuración centralizada del sitio.
 * Única fuente de verdad para marca, contacto y parámetros comerciales.
 * Nunca hardcodear estos valores en componentes.
 */
export const site = {
  name: 'Raiden',
  tagline: 'The Future of Power',
  description:
    'Bicimotos y trimotos eléctricas en Lima, Perú. Descubre tu instinto RAIDEN: Golden Eagle, Royal Tiger, Vortex Kobra y Titan Rhino. Repuestos, servicio técnico y asesoría por WhatsApp.',
  /** Empresa titular (distribuidor oficial) */
  legalName: 'EG Motors SAC',
  ruc: '20615247384',
  address: 'Calle Omega con Pj 48, Bocanegra, Callao',
  mapsUrl: 'https://maps.app.goo.gl/x3R1hTben769u2PX7',
  hours: 'Lunes a domingo: 10:00 a. m. – 8:00 p. m.',
  /** Número visible (formato humano) */
  phoneDisplay: '+51 989 853 431',
  url: import.meta.env.PUBLIC_SITE_URL ?? 'https://raiden.example.com',
  locale: 'es-PE',
  lang: 'es',
  currency: 'PEN',
  country: 'PE',
  /** Número en formato internacional sin "+", p.ej. 51987654321 (Perú) */
  whatsappNumber: (import.meta.env.PUBLIC_WHATSAPP_NUMBER as string | undefined) ?? '51989853431',
  contactEmail: (import.meta.env.PUBLIC_CONTACT_EMAIL as string | undefined) ?? 'raiden.peru@gmail.com',
  social: {
    instagram: 'https://www.instagram.com/egmotors.peru/',
    tiktok: 'https://www.tiktok.com/@egmotors.peru',
    facebook: 'https://www.facebook.com/EGMOTORSPERU',
    youtube: '',
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
