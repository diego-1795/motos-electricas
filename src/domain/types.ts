/**
 * Entidades de dominio. Independientes de framework, proveedor y UI.
 * Las interfaces aquí son el contrato que cumplen todos los repositorios
 * (JSON en el MVP, Supabase/PostgreSQL después).
 *
 * Catálogo Raiden (Perú): bicimotos y trimotos eléctricas de baja velocidad
 * (25 km/h, sin licencia) + repuestos. Ver docs/21-decisions.md ADR-015.
 */

export type CategorySlug = 'bicimotos' | 'trimotos' | 'repuestos';

export type UseCase =
  | 'ciudad'
  | 'trabajo'
  | 'reparto'
  | 'ocio'
  | 'trayectos-largos'
  | 'dos-personas'
  | 'carga';

export type Availability = 'en-stock' | 'bajo-pedido' | 'proximamente' | 'agotado';

/** Licencias de conducir MTC (Perú). 'sin-licencia' = vehículo que no la requiere (bicimotos ≤25 km/h). */
export type LicenseType = 'sin-licencia' | 'B-I' | 'B-IIa' | 'B-IIb' | 'B-IIc';

/** Versión comercial de un modelo. Estándar = 350 W / 48V 12Ah · Premium = 500 W / 48V 20Ah. */
export type VariantTier = 'estandar' | 'premium';

export interface Money {
  /** Importe en céntimos de sol para evitar errores de coma flotante */
  amount: number;
  currency: 'PEN';
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
  /** Ciclos de vida estimados */
  cycles?: number;
  /** Vida útil estimada en meses */
  lifeMonths?: number;
  brand?: string;
}

export interface Specs {
  /** Autonomía declarada en km (valor máximo del rango) */
  rangeKm: number;
  /** Autonomía mínima del rango declarado, si el fabricante da un rango */
  rangeMinKm?: number;
  /** Velocidad máxima km/h */
  topSpeedKmh: number;
  /** Potencia nominal en W */
  powerW: number;
  /** Potencia pico en W */
  peakPowerW?: number;
  battery: Battery;
  /** Peso en kg (con batería) */
  weightKg?: number;
  /** Carga máxima en kg */
  maxLoadKg: number;
  seats: 1 | 2 | 3;
  license: LicenseType;
  /** Largo x ancho x alto en mm */
  dimensionsMm?: [number, number, number];
  /** Medida de llanta, p. ej. 14 x 2.5" */
  tires?: string;
  wheelInches?: number;
  brakes: string;
  suspension: string;
  lighting: string;
  display: string;
  drivingModes: string[];
  motorType: string;
  /** Controlador, p. ej. "6 tubos SineWave" */
  controller?: string;
  ipRating?: string;
  /** Garantía en meses */
  warrantyMonths: number;
  batteryWarrantyMonths: number;
  /** Lista completa de características tal como la entrega el fabricante */
  features: string[];
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
  tier: VariantTier;
  /** Ej. "350 W · 48V 12Ah" */
  description?: string;
  price: Money;
  /** Sobrescribe specs del producto base si la variante los cambia */
  specsOverride?: Partial<Pick<Specs, 'rangeKm' | 'rangeMinKm' | 'topSpeedKmh' | 'powerW' | 'battery' | 'weightKg' | 'controller'>>;
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
  /** Subtítulo comercial corto, p.ej. "Bicimoto eléctrica urbana" */
  subtitle: string;
  /** Claim del hero, p.ej. "Afronta nuevas rutas con tu" */
  claim: string;
  description: string;
  category: CategorySlug;
  brand: string;
  images: ImageRef[];
  /** Imagen apaisada para el hero de portada (opcional) */
  heroImage?: ImageRef;
  specs: Specs;
  variants: ProductVariant[];
  colors: ProductColor[];
  /** Slugs de repuestos compatibles */
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
  /** Recursos descargables / multimedia de la ficha */
  datasheetUrl?: string;
  manualUrl?: string;
  videoUrl?: string;
}

export type PartKind =
  | 'bateria'
  | 'motor'
  | 'controlador'
  | 'cargador'
  | 'iluminacion'
  | 'frenos'
  | 'cables'
  | 'mandos'
  | 'seguridad'
  | 'llantas'
  | 'otro';

/** Repuesto (antes "Accessory"). Se vende por unidad o por par. */
export interface Part {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: Money;
  image?: ImageRef;
  availability: Availability;
  kind: PartKind;
  unit: 'UND' | 'PAR';
  /** Código interno/SKU */
  code?: string;
  /** Slugs de productos compatibles; vacío = universal */
  compatibleWith: string[];
}

/** @deprecated usar Part */
export type Accessory = Part;

/* ---------- Carrito / pedido ---------- */

/** 'accessory' se mantiene como valor interno para repuestos (compatibilidad del carrito persistido) */
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
