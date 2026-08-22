import { useMemo, useState } from 'preact/hooks';
import type { Accessory, ImageRef, ProductColor, ProductVariant } from '../domain/types';
import { formatMoney } from '../domain/money';
import { add, eur } from '../domain/money';
import { availabilityLabel } from '../domain/product';
import { addToCart } from '../stores/cart';
import { toast } from '../stores/toast';
import { site } from '../config/site';

/**
 * Configurador de producto (variante + color + cantidad + accesorios).
 * Recibe datos serializados desde Astro; no conoce repositorios.
 * Solo calcula precio con funciones de dominio y delega en el store.
 */
interface Props {
  slug: string;
  name: string;
  variants: ProductVariant[];
  colors: ProductColor[];
  accessories: Accessory[];
  image?: ImageRef;
}

const badgeClass: Record<ProductVariant['availability'], string> = {
  'en-stock': 'badge badge--stock',
  'bajo-pedido': 'badge badge--order',
  proximamente: 'badge badge--soon',
  agotado: 'badge',
};

export default function ProductConfigurator({ slug, name, variants, colors, accessories, image }: Props) {
  const [variantId, setVariantId] = useState(variants.find((v) => v.isDefault)?.id ?? variants[0]!.id);
  const [colorId, setColorId] = useState(colors[0]?.id);
  const [qty, setQty] = useState(1);
  const [extras, setExtras] = useState<Set<string>>(new Set());

  const variant = variants.find((v) => v.id === variantId) ?? variants[0]!;
  const color = colors.find((c) => c.id === colorId);
  const unit = useMemo(() => (color?.priceDelta ? add(variant.price, color.priceDelta) : variant.price), [variant, color]);
  const extrasTotal = useMemo(
    () => accessories.filter((a) => extras.has(a.slug)).reduce((m, a) => add(m, a.price), eur(0)),
    [accessories, extras],
  );
  const total = add(eur(unit.amount * qty), extrasTotal);
  const unavailable = variant.availability === 'agotado';

  const submit = (e: Event) => {
    e.preventDefault();
    if (unavailable) return;
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
      image,
    });
    for (const a of accessories) {
      if (extras.has(a.slug)) {
        addToCart({ kind: 'accessory', slug: a.slug, name: a.name, unitPrice: a.price, quantity: 1, image: a.image });
      }
    }
    toast(`${name} añadido a tu solicitud`);
  };

  const toggleExtra = (s: string) => {
    const next = new Set(extras);
    next.has(s) ? next.delete(s) : next.add(s);
    setExtras(next);
  };

  return (
    <form class="cfg" onSubmit={submit} data-configurator>
      <div class="cfg__price">
        <span class="cfg__amount" data-price>
          {formatMoney(unit)}
        </span>
        <span class={badgeClass[variant.availability]}>{availabilityLabel[variant.availability]}</span>
      </div>

      {variants.length > 1 && (
        <fieldset class="cfg__group">
          <legend class="label">Versión</legend>
          <div class="cfg__choices">
            {variants.map((v) => (
              <label class="choice" key={v.id}>
                <input type="radio" name="variant" value={v.id} checked={v.id === variantId} onChange={() => setVariantId(v.id)} />
                {v.name}
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

      {accessories.length > 0 && (
        <fieldset class="cfg__group">
          <legend class="label">Añadir accesorios</legend>
          <div class="cfg__extras">
            {accessories.map((a) => (
              <label class="cfg__extra" key={a.slug}>
                <input type="checkbox" checked={extras.has(a.slug)} onChange={() => toggleExtra(a.slug)} />
                <span>{a.name}</span>
                <span class="muted">+{formatMoney(a.price)}</span>
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
      <style>{`
        .cfg{display:flex;flex-direction:column;gap:var(--s-5)}
        .cfg__price{display:flex;align-items:center;gap:var(--s-3);flex-wrap:wrap}
        .cfg__amount{font-size:var(--fs-2xl);font-weight:600;letter-spacing:var(--tracking-tight)}
        .cfg__group{border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--s-3)}
        .cfg__choices{display:flex;flex-wrap:wrap;gap:var(--s-2)}
        .cfg__swatches{display:flex;gap:var(--s-3)}
        .cfg__extras{display:flex;flex-direction:column;gap:var(--s-2)}
        .cfg__extra{display:grid;grid-template-columns:auto 1fr auto;gap:var(--s-3);align-items:center;padding:var(--s-3) var(--s-4);border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg-elev);cursor:pointer;font-size:var(--fs-sm)}
        .cfg__extra:has(input:checked){border-color:var(--fg)}
        .cfg__extra input{width:1.125rem;height:1.125rem;accent-color:var(--fg)}
        .cfg__actions{display:flex;gap:var(--s-3);flex-wrap:wrap}
        .cfg__actions .btn{flex:1}
      `}</style>
    </form>
  );
}
