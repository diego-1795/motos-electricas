import type { ImageRef, Money } from '../domain/types';
import { addToCart } from '../stores/cart';
import { toast } from '../stores/toast';

/** Botón "+ Añadir" de tarjetas: añade la variante por defecto y el primer color. */
interface Props {
  kind: 'product' | 'accessory';
  slug: string;
  name: string;
  unitPrice: Money;
  variantId?: string;
  variantName?: string;
  colorId?: string;
  colorName?: string;
  image?: ImageRef;
  disabled?: boolean;
  class?: string;
  label?: string;
}

export default function QuickAdd(p: Props) {
  const onClick = () => {
    addToCart({
      kind: p.kind,
      slug: p.slug,
      name: p.name,
      unitPrice: p.unitPrice,
      quantity: 1,
      variantId: p.variantId,
      variantName: p.variantName,
      colorId: p.colorId,
      colorName: p.colorName,
      image: p.image,
    });
    toast(`${p.name} añadido a tu solicitud`);
  };
  return (
    <button type="button" class={p.class ?? 'btn btn--secondary btn--sm'} onClick={onClick} disabled={p.disabled} data-quick-add={p.slug}>
      {p.label ?? '+ Añadir al carrito'}
    </button>
  );
}
