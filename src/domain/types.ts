/**
 * Entidades de dominio. Independientes de framework, proveedor y UI.
 * Las interfaces aquí son el contrato que cumplen todos los repositorios
 * (JSON en el MVP, Supabase/PostgreSQL después).
 */

export type CategorySlug =
  | 'scooters-electricos'
  | 'motos-electricas'
  | 'bicimotos'
  | 'trimotos'
  | 'vehiculos-carga'
  | 'cuatrimotos'
  | 'accesorios';

export type UseCase =
  | 'ciudad'
  | 'trabajo'
  | 'reparto'
  | 'ocio'
  | 'trayectos-largos'
  | 'dos-personas'
  | 'carga';

export type Availability = 'en-stock' | 'bajo-pedido' | 'proximamente' | 'agotado';

export type LicenseType = 'sin-carnet' | 'AM' | 'A1' | 'A2' | 'B';

export interface Money {
  /** Importe en céntimos para evitar errores de coma flotante */
  amount: number;
  currency: 'EUR';
}

export interface ImageRef {
  /** Ruta relativa a src/assets o URL absoluta */
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface Category {
  slug: CategorySlug;
  name: string;
  /** Título H1/SEO de la página de categoría */
  title: string;
  description: string;
  /** Texto editorial corto para la navegación visual */
  tagline: string;
  image?: ImageRef;
  order: number;
}

export interface Brand {
  slug: string;
  name: string;
  country?: string;
}

export interface Battery {
  /** Tensión nominal en voltios */
  voltage: number;
  /** Capacidad en Ah */
  capacityAh: number;
  /** Capacidad en kWh (derivable, se guarda para consultas/filtros) */
  capacityKwh: number;
  chemistry: 'LiFePO4' | 'NMC' | 'plomo-acido' | 'otro';
  removable: boolean;
  /** Tiempo de carga en horas (mín-máx) */
  chargeHours: [number, number];
  cycles?: number;
}

export interface Specs {
  /** Autonomía declarada en km */
  rangeKm: number;
  /** Velocidad máxima km/h */
  topSpeedKmh: number;
  /** Potencia nominal en W */
  powerW: number;
  /** Potencia pico en W */
  peakPowerW?: number;
  battery: Battery;
  /** Peso en kg (con batería) */
  weightKg: number;
  /** Carga máxima en kg */
  maxLoadKg: number;
  seats: 1 | 2 | 3;
  license: LicenseType;
  /** Largo x ancho x alto en mm */
  dimensionsMm: [number, number, number];
  wheelInches?: number;
  brakes: string;
  suspension: string;
  lighting: string;
  display: string;
  drivingModes: string[];
  motorType: string;
  ipRating?: string;
  /** Garantía en meses */
  warrantyMonths: number;
  batteryWarrantyMonths: number;
}

export interface ProductColor {
  id: string;
  name: string;
  /** Color CSS para el swatch */
  hex: string;
  image?: ImageRef;
  priceDelta?: Money;
}

export interface ProductVariant {
  id: string;
  name: string;
  /** Ej. "72V 32Ah", "Doble batería" */
  description?: string;
  price: Money;
  /** Sobrescribe specs del producto base si la variante los cambia */
  specsOverride?: Partial<Pick<Specs, 'rangeKm' | 'topSpeedKmh' | 'powerW' | 'battery' | 'weightKg'>>;
  availability: Availability;
  sku?: string;
  isDefault?: boolean;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface Review {
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  date: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** Subtítulo comercial corto, p.ej. "Moto eléctrica deportiva" */
  subtitle: string;
  claim: string;
  description: string;
  category: CategorySlug;
  brand: string;
  images: ImageRef[];
  specs: Specs;
  variants: ProductVariant[];
  colors: ProductColor[];
  /** Slugs de accesorios compatibles */
  accessories: string[];
  /** Slugs de modelos similares para la sección de comparación */
  related: string[];
  useCases: UseCase[];
  highlights: string[];
  /** Secciones tecnológicas (motor, batería, frenos…) */
  technology: { title: string; text: string }[];
  faqs: FAQ[];
  reviews?: Review[];
  /** Orden manual para "Recomendados" */
  featured: number;
  isNew?: boolean;
  isHero?: boolean;
  publishedAt: string;
  seo?: { title?: string; description?: string };
}

export interface Accessory {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: Money;
  image?: ImageRef;
  availability: Availability;
  /** Tipo para agrupar: batería, casco, baúl, cargador… */
  kind: 'bateria' | 'casco' | 'baul' | 'cargador' | 'seguridad' | 'otro';
  /** Slugs de productos compatibles; vacío = universal */
  compatibleWith: string[];
}

/* ---------- Carrito / pedido ---------- */

export type CartItemKind = 'product' | 'accessory';

export interface CartItem {
  /** Clave única: product:slug:variantId:colorId o accessory:slug */
  key: string;
  kind: CartItemKind;
  slug: string;
  name: string;
  variantId?: string;
  variantName?: string;
  colorId?: string;
  colorName?: string;
  unitPrice: Money;
  quantity: number;
  image?: ImageRef;
}

export interface Cart {
  items: CartItem[];
  notes: string;
  updatedAt: string;
}

export interface OrderRequest {
  cart: Cart;
  customer?: Customer;
  total: Money;
  createdAt: string;
}

export interface Customer {
  name?: string;
  city?: string;
}

export interface WhatsAppRequest {
  phone: string;
  message: string;
  url: string;
}

/* ---------- Contenido ---------- */

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  category: 'guias' | 'comparativas' | 'autonomia' | 'baterias' | 'mantenimiento' | 'legislacion' | 'movilidad' | 'compra';
  publishedAt: string;
  updatedAt?: string;
  author: string;
  readingMinutes: number;
  image?: ImageRef;
  /** Slugs de productos que el artículo recomienda */
  relatedProducts: string[];
}
