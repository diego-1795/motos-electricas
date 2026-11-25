import { useRef } from 'preact/hooks';
import type { AdminKind, CatalogEntry } from '../../domain/admin';
import { applyProductPatch } from '../../domain/adminPolicy';
import type { CategorySlug, Part, Product } from '../../domain/types';
import { availabilityLabel, productAvailability, sortedVariants, tierLabel } from '../../domain/product';
import { partKindSingular } from '../../lib/labels';
import { kindLabel, useAdmin } from './context';
import PriceCell from './PriceCell';
import StockCell from './StockCell';
import { effectiveAvailability, isLowStock, LOW_STOCK_LABEL } from '../../domain/stock';
import { site } from '../../config/site';
import HiddenToggle from './HiddenToggle';

interface Props {
  kind: AdminKind;
  entries: CatalogEntry<Product | Part>[];
  /** Total sin filtrar (para el mensaje "sin resultados") */
  total: number;
  admin: boolean;
  onEdit: (slug: string) => void;
  onDelete: (slug: string) => void;
  /** Especificaciones (admin y editor, ADR-032) */
  onSpecs: (slug: string) => void;
}

const categoryLabel: Record<CategorySlug, string> = { bicimotos: 'Bicimotos', trimotos: 'Trimotos', repuestos: 'Repuestos', promociones: 'Promociones' };

const PREMIUM_RULE = 'La versión Premium no puede ser más barata que la Estándar (cambia primero la otra versión)';

/**
 * Lista de productos o repuestos: nombre, categoría/tipo, precio(s) editables, disponibilidad,
 * estado (interruptor Oculto) y acciones de administrador. En móvil cada fila se apila como tarjeta.
 */
export default function CatalogTable({ kind, entries, total, admin, onEdit, onDelete, onSpecs }: Props) {
  const { api, applyWrite, latestSha } = useAdmin();
  // Escrituras sobre la misma ficha en serie: la segunda (p. ej. "Guardar" precio y acto seguido "Oculto")
  // espera a la primera y usa el sha que esta devolvió; sin esto el servidor respondería 409 a un cambio propio.
  const queues = useRef(new Map<string, Promise<void>>());

  const patch = (slug: string, body: { prices?: Record<string, number>; price?: number; hidden?: boolean; stock?: Record<string, number | null> | number | null }): Promise<void> => {
    const key = `${kind}/${slug}`;
    const prev = queues.current.get(key) ?? Promise.resolve();
    const run = prev
      .catch(() => undefined)
      .then(async () => {
        const sha = latestSha(kind, slug);
        if (!sha) throw new Error('La ficha ya no está en el catálogo; recarga la página');
        // Exactamente { sha, prices | price | hidden | stock }: el servidor rechaza (422) cualquier otra clave
        const payload = { sha, ...body };
        const result =
          kind === 'products'
            ? await api.patch('products', slug, payload as Parameters<typeof api.patch<'products'>>[2])
            : await api.patch('repuestos', slug, payload as Parameters<typeof api.patch<'repuestos'>>[2]);
        applyWrite(kind, result);
      });
    queues.current.set(key, run);
    return run;
  };

  if (entries.length === 0) {
    return (
      <p class="adm-empty muted" data-admin-empty>
        {total === 0 ? `No hay ${kindLabel[kind].plural.toLowerCase()} en el catálogo.` : 'Ningún resultado para esa búsqueda.'}
      </p>
    );
  }

  return (
    <div class="table-wrap adm-table-wrap">
      {/* Roles explícitos: en móvil las filas pasan a display:block y, sin ellos, Chrome/Safari pierden la semántica de tabla */}
      <table class="table adm-table" role="table" data-admin-table={kind}>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Nombre</th>
            <th scope="col" role="columnheader">{kind === 'products' ? 'Categoría' : 'Tipo'}</th>
            <th scope="col" role="columnheader">{kind === 'products' ? 'Precios' : 'Precio'}</th>
            <th scope="col" role="columnheader">Stock</th>
            <th scope="col" role="columnheader">Disponibilidad</th>
            <th scope="col" role="columnheader">Estado</th>
            <th scope="col" role="columnheader">Acciones</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {entries.map((entry) => {
            const d = entry.data;
            const hidden = d.hidden === true;
            const isProduct = kind === 'products';
            const p = isProduct ? (d as Product) : null;
            const part = isProduct ? null : (d as Part);
            const variants = p ? sortedVariants(p) : [];
            return (
              <tr key={d.slug} role="row" class={hidden ? 'is-hidden' : undefined} data-admin-row={d.slug}>
                <td role="cell" data-label="Nombre">
                  <div class="adm-name">
                    <strong>{d.name}</strong>
                    {hidden && <span class="badge adm-badge-hidden">Oculto</span>}
                  </div>
                  {admin && <code class="adm-slug">{d.slug}</code>}
                </td>
                <td role="cell" data-label={isProduct ? 'Categoría' : 'Tipo'}>{p ? categoryLabel[p.category] : partKindSingular[part!.kind]}</td>
                <td role="cell" data-label={isProduct ? 'Precios' : 'Precio'} class="adm-td-prices">
                  {p &&
                    variants.map((v) => (
                      <PriceCell
                        key={v.id}
                        label={variants.length > 1 ? tierLabel[v.tier] : undefined}
                        name={`Precio ${tierLabel[v.tier]} de ${p.name}`}
                        amount={v.price.amount}
                        testId={`${p.slug}:${v.id}`}
                        validate={(cents) => {
                          // La misma política que impone el servidor (adminPolicy), sin duplicar la regla aquí
                          const r = applyProductPatch(p, { sha: entry.sha, prices: { [v.id]: cents } });
                          if (r.ok) return null;
                          return r.errors.some((m) => m.includes('Premium')) ? PREMIUM_RULE : r.errors.join('; ');
                        }}
                        onSave={(cents) => patch(p.slug, { prices: { [v.id]: cents } })}
                      />
                    ))}
                  {part && (
                    <PriceCell
                      name={`Precio de ${part.name}`}
                      amount={part.price.amount}
                      testId={part.slug}
                      onSave={(cents) => patch(part.slug, { price: cents })}
                    />
                  )}
                </td>
                <td role="cell" data-label="Stock" class="adm-td-prices">
                  {p &&
                    variants.map((v) => (
                      <StockCell
                        key={v.id}
                        label={variants.length > 1 ? tierLabel[v.tier] : undefined}
                        name={`Stock ${tierLabel[v.tier]} de ${p.name}`}
                        stock={v.stock}
                        testId={`${p.slug}:${v.id}`}
                        onSave={(n) => patch(p.slug, { stock: { [v.id]: n } })}
                      />
                    ))}
                  {part && <StockCell name={`Stock de ${part.name}`} stock={part.stock} testId={part.slug} onSave={(n) => patch(part.slug, { stock: n })} />}
                </td>
                <td role="cell" data-label="Disponibilidad" data-admin-availability={d.slug}>
                  {/* La disponibilidad que verá la web: con stock, manda el número (ADR-035) */}
                  {availabilityLabel[p ? productAvailability({ ...p, variants: p.variants.map((v) => ({ ...v, availability: effectiveAvailability(v.availability, v.stock) })) }) : effectiveAvailability(part!.availability, part!.stock)]}
                  {(p ? p.variants.some((v) => isLowStock(v.stock, site.stock.lowProducts)) : isLowStock(part!.stock, site.stock.lowParts)) && (
                    <span class="badge badge--low adm-badge-low">{LOW_STOCK_LABEL}</span>
                  )}
                </td>
                <td role="cell" data-label="Estado">
                  <HiddenToggle hidden={hidden} name={d.name} testId={d.slug} onChange={(next) => patch(d.slug, { hidden: next })} />
                </td>
                <td role="cell" data-label="Acciones" class="adm-td-actions">
                  <button type="button" class="btn btn--secondary btn--sm" onClick={() => onSpecs(d.slug)} aria-label={`Especificaciones de ${d.name}`} data-admin-specs-open={d.slug}>
                    Especificaciones
                  </button>
                  {admin && (
                    <>
                      <button type="button" class="btn btn--secondary btn--sm" onClick={() => onEdit(d.slug)} aria-label={`Editar ficha de ${d.name}`}>
                        Editar ficha
                      </button>
                      <button type="button" class="btn btn--ghost btn--sm adm-btn-danger" onClick={() => onDelete(d.slug)} aria-label={`Borrar ${d.name}`}>
                        Borrar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
