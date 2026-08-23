import { useStore } from '@nanostores/preact';
import { useState } from 'preact/hooks';
import { $compare, removeCompare, toggleCompare, clearCompare } from '../stores/compare';
import { site } from '../config/site';
import { formatMoney } from '../domain/money';

/** Resumen serializable de producto para comparar (generado en Astro). */
export interface CompareRow {
  slug: string;
  name: string;
  subtitle: string;
  image: string;
  priceFrom: number;
  rangeKm: number;
  topSpeedKmh: number;
  powerW: number;
  battery: string;
  chargeHours: string;
  weightKg: number;
  dimensions: string;
  seats: number;
  license: string;
  warranty: string;
  availability: string;
}

type Key = keyof CompareRow;
const ROWS: { key: Key; label: string; fmt?: (v: CompareRow[Key]) => string; best?: 'max' | 'min' }[] = [
  { key: 'priceFrom', label: 'Precio desde', fmt: (v) => formatMoney({ amount: v as number, currency: 'PEN' }), best: 'min' },
  { key: 'rangeKm', label: 'Autonomía', fmt: (v) => `${v} km`, best: 'max' },
  { key: 'topSpeedKmh', label: 'Velocidad máx.', fmt: (v) => `${v} km/h`, best: 'max' },
  { key: 'powerW', label: 'Potencia', fmt: (v) => `${(v as number) / 1000} kW`, best: 'max' },
  { key: 'battery', label: 'Batería' },
  { key: 'chargeHours', label: 'Carga' },
  { key: 'weightKg', label: 'Peso', fmt: (v) => `${v} kg`, best: 'min' },
  { key: 'dimensions', label: 'Dimensiones' },
  { key: 'seats', label: 'Plazas', best: 'max' },
  { key: 'license', label: 'Licencia' },
  { key: 'warranty', label: 'Garantía' },
  { key: 'availability', label: 'Disponibilidad' },
];

export default function CompareTable({ products }: { products: CompareRow[] }) {
  const slugs = useStore($compare);
  const [pick, setPick] = useState('');
  const selected = slugs.map((s) => products.find((p) => p.slug === s)).filter((p): p is CompareRow => !!p);
  const remaining = products.filter((p) => !slugs.includes(p.slug));

  const bestOf = (row: (typeof ROWS)[number]) => {
    if (!row.best || selected.length < 2) return undefined;
    const vals = selected.map((p) => p[row.key] as number);
    return row.best === 'max' ? Math.max(...vals) : Math.min(...vals);
  };

  return (
    <div class="cmp" data-compare-table>
      <div class="cmp__toolbar">
        {selected.length < site.compareLimit && remaining.length > 0 && (
          <label class="cmp__add">
            <span class="label">Añadir modelo ({selected.length}/{site.compareLimit})</span>
            <select
              class="select"
              value={pick}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v) toggleCompare(v);
                setPick('');
              }}
            >
              <option value="">Elige un modelo…</option>
              {remaining.map((p) => (
                <option value={p.slug} key={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected.length > 0 && (
          <button type="button" class="btn btn--ghost btn--sm" onClick={clearCompare}>
            Vaciar comparador
          </button>
        )}
      </div>

      {selected.length === 0 ? (
        <p class="muted cmp__empty">Aún no has elegido modelos. Añade hasta {site.compareLimit} desde el catálogo o con el selector.</p>
      ) : (
        <div class="table-wrap">
          <table class="table table--sticky cmp__table">
            <thead>
              <tr>
                <th scope="col">
                  <span class="visually-hidden">Característica</span>
                </th>
                {selected.map((p) => (
                  <th scope="col" key={p.slug}>
                    <div class="cmp__head">
                      <img src={p.image} alt="" width="160" height="100" loading="lazy" />
                      <a href={`/motos-electricas/${p.slug}`}>{p.name}</a>
                      <small class="muted">{p.subtitle}</small>
                      <button type="button" class="btn btn--ghost btn--sm" onClick={() => removeCompare(p.slug)} aria-label={`Quitar ${p.name}`}>
                        Quitar
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const best = bestOf(r);
                return (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    {selected.map((p) => {
                      const v = p[r.key];
                      const isBest = best !== undefined && v === best;
                      return (
                        <td key={p.slug} class={isBest ? 'cmp__best' : undefined}>
                          {r.fmt ? r.fmt(v) : String(v)}
                          {isBest && <span class="visually-hidden"> (mejor)</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <th scope="row">
                  <span class="visually-hidden">Acciones</span>
                </th>
                {selected.map((p) => (
                  <td key={p.slug}>
                    <a href={`/motos-electricas/${p.slug}`} class="btn btn--primary btn--sm">
                      Ver modelo
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
