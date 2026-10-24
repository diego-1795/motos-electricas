import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ImageRef, ProductColor, ProductVariant } from '../domain/types';
import { formatMoney } from '../domain/money';
import { add, pen } from '../domain/money';
import { availabilityLabel, tierLabel } from '../domain/product';
import { addToCart } from '../stores/cart';
import { toast } from '../stores/toast';
import { site } from '../config/site';

/**
 * Configurador de producto (versión + color + cantidad + repuestos).
 * Recibe datos serializados desde Astro; no conoce repositorios.
 * Solo calcula precio con funciones de dominio y delega en el store.
 *
 * Galería: la imagen principal se renderiza en el servidor (LCP) dentro de
 * `[data-product-image]`; al cambiar de color la isla actualiza src/srcset/alt
 * con las URLs optimizadas que le pasa la página (`colorImages`). Las miniaturas
 * `[data-color-thumb]` también seleccionan el color.
 */
export interface OptimizedImage {
  src: string;
  srcset?: string;
  sizes?: string;
  alt: string;
}

interface Props {
  slug: string;
  name: string;
  variants: ProductVariant[];
  colors: ProductColor[];
  /** Imagen para el carrito (URL pública) */
  image?: ImageRef;
  /** Imagen optimizada por color (id → src/srcset) para la galería */
  colorImages?: Record<string, OptimizedImage>;
}

const badgeClass: Record<ProductVariant['availability'], string> = {
  'en-stock': 'badge badge--stock',
  'bajo-pedido': 'badge badge--order',
  proximamente: 'badge badge--soon',
  agotado: 'badge',
};

export default function ProductConfigurator({ slug, name, variants, colors, image, colorImages = {} }: Props) {
  const [variantId, setVariantId] = useState(variants.find((v) => v.isDefault)?.id ?? variants[0]!.id);
  const [colorId, setColorId] = useState(colors[0]?.id);
  const [qty, setQty] = useState(1);

  const variant = variants.find((v) => v.id === variantId) ?? variants[0]!;
  const color = colors.find((c) => c.id === colorId);
  const unit = useMemo(() => (color?.priceDelta ? add(variant.price, color.priceDelta) : variant.price), [variant, color]);
  // Los repuestos se compran aparte desde /repuestos (decisión del cliente, 2026-10-23)
  const total = pen(unit.amount * qty);
  const unavailable = variant.availability === 'agotado';

  // Galería: sincroniza la imagen principal SSR y las miniaturas con el color elegido
  useEffect(() => {
    if (!colorId) return;
    const img = document.querySelector<HTMLImageElement>('[data-product-image] img');
    const opt = colorImages[colorId];
    if (img && opt && img.currentSrc !== opt.src) {
      img.src = opt.src;
      if (opt.srcset) img.srcset = opt.srcset;
      if (opt.sizes) img.sizes = opt.sizes;
      img.alt = opt.alt;
    }
    document.querySelectorAll<HTMLElement>('[data-color-thumb]').forEach((t) => {
      t.setAttribute('aria-pressed', String(t.dataset.colorThumb === colorId));
    });
  }, [colorId, colorImages]);

  // Ficha técnica por versión: muestra solo los valores de la versión elegida
  // ([data-spec-variant], HTML estático de ProductTabs/SpecTiles) y el nombre en [data-variant-name]
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('[data-variant-specs]').forEach((root) => root.classList.add('is-js'));
    document.querySelectorAll<HTMLElement>('[data-spec-variant]').forEach((el) => {
      el.classList.toggle('spec-variant--off', el.dataset.specVariant !== variantId);
    });
    document.querySelectorAll<HTMLElement>('[data-variant-name]').forEach((el) => {
      el.textContent = tierLabel[variant.tier];
    });
  }, [variantId, variant.tier]);

  // Las miniaturas (HTML estático) seleccionan el color
  useEffect(() => {
    const onClick = (e: Event) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-color-thumb]');
      if (t?.dataset.colorThumb) setColorId(t.dataset.colorThumb);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const submit = (e: Event) => {
    e.preventDefault();
    if (unavailable) return;
    const cartImage = colorId && colorImages[colorId] && image ? { ...image, src: colorImages[colorId]!.src } : image;
    addToCart({
      kind: 'product',
      slug,
      name,
      variantId: variant.id,
      variantName: variant.name,
      colorId: color?.id,
      colorName: color?.name,
      unitPrice: unit,
      quantity: qty,
      image: cartImage,
    });
    toast(`${name} añadido a tu solicitud`);
  };

  return (
    <form class="cfg" onSubmit={submit} data-configurator>
      <div class="cfg__price">
        <span class="cfg__amount" data-price>
          {formatMoney(unit)}
        </span>
        <span class={badgeClass[variant.availability]}>{availabilityLabel[variant.availability]}</span>
        {variants.length > 1 && <span class="muted" style="font-size:var(--fs-sm)">Versión {tierLabel[variant.tier]}</span>}
      </div>

      {variants.length > 1 && (
        <fieldset class="cfg__group">
          <legend class="label">Versión</legend>
          <div class="cfg__choices">
            {variants.map((v) => (
              <label class="choice" key={v.id} data-tier={v.tier}>
                <input type="radio" name="variant" value={v.id} checked={v.id === variantId} onChange={() => setVariantId(v.id)} />
                {tierLabel[v.tier]}
                <span class="muted" style="font-weight:400">
                  · {formatMoney(v.price)}
                </span>
              </label>
            ))}
          </div>
          {variant.description && <p class="hint">{variant.description}</p>}
        </fieldset>
      )}

      {colors.length > 0 && (
        <fieldset class="cfg__group">
          <legend class="label">
            Color: <span style="font-weight:400">{color?.name}</span>
          </legend>
          <div class="cfg__swatches">
            {colors.map((c) => (
              <label class="swatch" style={`background:${c.hex}`} key={c.id} title={c.name}>
                <input type="radio" name="color" value={c.id} checked={c.id === colorId} onChange={() => setColorId(c.id)} />
                <span class="visually-hidden">{c.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div class="cfg__actions">
        <div class="stepper" aria-label="Unidades">
          <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Menos unidades">
            −
          </button>
          <input
            type="number"
            min={1}
            max={site.maxQtyPerLine}
            value={qty}
            aria-label="Unidades"
            onChange={(e) => setQty(Math.min(site.maxQtyPerLine, Math.max(1, Number((e.target as HTMLInputElement).value) || 1)))}
          />
          <button type="button" onClick={() => setQty(Math.min(site.maxQtyPerLine, qty + 1))} aria-label="Más unidades">
            +
          </button>
        </div>
        <button type="submit" class="btn btn--primary btn--lg" disabled={unavailable} data-add-to-cart>
          Añadir al carrito · {formatMoney(total)}
        </button>
      </div>
      <p class="hint">Sin pago online. Tras revisar el carrito, enviarás la solicitud por WhatsApp.</p>
    </form>
  );
}
