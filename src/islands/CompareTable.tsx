import { useStore } from '@nanostores/preact';
import { useState } from 'preact/hooks';
import { $compare, removeCompare, toggleCompare, clearCompare } from '../stores/compare';
import { site } from '../config/site';
import { formatMoney } from '../domain/money';

/** Resumen serializable de producto para comparar (generado en Astro). */
export interface CompareRow {
  slug: string;
  href: string;
  name: string;
  subtitle: string;
  category: string;
  image: string;
  priceFrom: number;
  tiers: string;
  rangeKm: number;
  rangeLabel: string;
  topSpeedKmh: number;
  powerW: number;
  powerLabel: string;
  battery: string;
  chargeHours: string;
  maxLoadKg: number;
  weightKg?: number;
  dimensions?: string;
  seats: number;
  license: string;
  warranty: string;
  availability: string;
}

type Key = keyof CompareRow;
interface RowDef {
  key: Key;
  label: string;
  fmt?: (v: CompareRow[Key], row: CompareRow) => string;
  /** Clave numérica usada para resaltar el mejor valor */
  bestKey?: Key;
  best?: 'max' | 'min';
}
const ROWS: RowDef[] = [
  { key: 'category', label: 'Categoría' },
  { key: 'priceFrom', label: 'Precio desde', fmt: (v) => formatMoney({ amount: v as number, currency: 'PEN' }), best: 'min' },
  { key: 'tiers', label: 'Versiones' },
  { key: 'rangeLabel', label: 'Autonomía', bestKey: 'rangeKm', best: 'max' },
  { key: 'topSpeedKmh', label: 'Velocidad máx.', fmt: (v) => `${v} km/h`, best: 'max' },
  { key: 'powerLabel', label: 'Potencia', bestKey: 'powerW', best: 'max' },
  { key: 'battery', label: 'Batería' },
  { key: 'chargeHours', label: 'Carga' },
  { key: 'maxLoadKg', label: 'Carga máxima', fmt: (v) => `${v} kg`, best: 'max' },
  { key: 'weightKg', label: 'Peso', fmt: (v) => (v === undefined ? '—' : `${v} kg`), best: 'min' },
  { key: 'dimensions', label: 'Dimensiones', fmt: (v) => (v ? String(v) : '—') },
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
  // Filas opcionales: se ocultan si ningún modelo seleccionado tiene el dato
  const rows = ROWS.filter((r) => (r.key === 'weightKg' || r.key === 'dimensions' ? selected.some((p) => p[r.key] !== undefined) : true));

  const bestOf = (row: RowDef) => {
    if (!row.best || selected.length < 2) return undefined;
    const k = row.bestKey ?? row.key;
    const vals = selected.map((p) => p[k]).filter((v): v is number => typeof v === 'number');
    if (vals.length < 2) return undefined;
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
                      <img src={p.image} alt="" width="160" height="200" loading="lazy" />
                      <a href={p.href}>{p.name}</a>
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
              {rows.map((r) => {
                const best = bestOf(r);
                return (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    {selected.map((p) => {
                      const v = p[r.key];
                      const cmpVal = p[r.bestKey ?? r.key];
                      const isBest = best !== undefined && cmpVal === best;
                      return (
                        <td key={p.slug} class={isBest ? 'cmp__best' : undefined}>
                          {r.fmt ? r.fmt(v, p) : v === undefined ? '—' : String(v)}
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
                    <a href={p.href} class="btn btn--primary btn--sm">
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
