import { useState } from 'preact/hooks';
import type { CategorySlug, Product, UseCase } from '../domain/types';
import { recommend, useCaseLabel, type FinderAnswers, type Recommendation } from '../domain/recommendation';
import { USE_CASES, TYPES } from '../domain/catalog';
import { formatMoney } from '../domain/money';
import { fromPrice, effectiveSpecs, maxRange, kw } from '../domain/product';
import { track } from '../services/analytics/AnalyticsService';

/**
 * "Encuentra tu moto": 3 pasos, sin dependencias. Recibe los productos
 * completos serializados (el catálogo es pequeño); la puntuación vive en domain.
 */
interface Props {
  products: Product[];
  images: Record<string, string>;
  categoryNames: Record<string, string>;
}

const BUDGETS = [
  { label: 'Hasta 2.000 €', value: 200000 },
  { label: 'Hasta 3.500 €', value: 350000 },
  { label: 'Hasta 5.000 €', value: 500000 },
  { label: 'Hasta 8.000 €', value: 800000 },
  { label: 'Sin límite', value: undefined },
];
const RANGES = [
  { label: 'Menos de 60 km', value: 40 },
  { label: '60-100 km', value: 60 },
  { label: '100-150 km', value: 100 },
  { label: 'Más de 150 km', value: 150 },
];
const SPEEDS = [
  { label: '25 km/h (sin carnet)', value: 25 },
  { label: '45 km/h (ciclomotor)', value: 45 },
  { label: '80 km/h (125cc eq.)', value: 80 },
  { label: '100+ km/h', value: 100 },
];

export default function BikeFinder({ products, images, categoryNames }: Props) {
  const [step, setStep] = useState(0);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [budget, setBudget] = useState<number | undefined | null>(null);
  const [range, setRange] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [types, setTypes] = useState<CategorySlug[]>([]);
  const [results, setResults] = useState<Recommendation[] | null>(null);

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const finish = () => {
    const answers: FinderAnswers = {
      useCases,
      budgetMax: budget ?? undefined,
      rangeMin: range ?? undefined,
      speedMin: speed ?? undefined,
      types,
    };
    const r = recommend(products, answers, 4);
    setResults(r);
    track({ name: 'finder_complete', topSlug: r[0]?.product.slug });
    setStep(3);
    document.getElementById('finder-results')?.focus();
  };

  const restart = () => {
    setStep(0);
    setUseCases([]);
    setBudget(null);
    setRange(null);
    setSpeed(null);
    setTypes([]);
    setResults(null);
  };

  return (
    <div class="bf" data-finder>
      {step < 3 && (
        <ol class="bf__progress" role="list" aria-label="Progreso">
          {['Uso', 'Preferencias', 'Tipo'].map((l, i) => (
            <li key={l} class={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              {l}
            </li>
          ))}
        </ol>
      )}

      {step === 0 && (
        <fieldset class="bf__step">
          <legend>
            <h2>¿Para qué la vas a usar?</h2>
            <p class="muted">Elige todo lo que aplique.</p>
          </legend>
          <div class="bf__choices">
            {USE_CASES.map((u) => (
              <label class="choice" key={u}>
                <input type="checkbox" checked={useCases.includes(u)} onChange={() => toggle(useCases, u, setUseCases)} />
                {useCaseLabel(u)}
              </label>
            ))}
          </div>
          <div class="bf__nav">
            <button type="button" class="btn btn--primary btn--lg" onClick={() => setStep(1)} disabled={useCases.length === 0}>
              Continuar
            </button>
          </div>
        </fieldset>
      )}

      {step === 1 && (
        <div class="bf__step">
          <h2>Tus preferencias</h2>
          <fieldset class="bf__group">
            <legend class="label">Presupuesto</legend>
            <div class="bf__choices">
              {BUDGETS.map((b) => (
                <label class="choice" key={b.label}>
                  <input type="radio" name="budget" checked={budget !== null && budget === b.value} onChange={() => setBudget(b.value)} />
                  {b.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset class="bf__group">
            <legend class="label">Autonomía que necesitas</legend>
            <div class="bf__choices">
              {RANGES.map((r) => (
                <label class="choice" key={r.label}>
                  <input type="radio" name="range" checked={range === r.value} onChange={() => setRange(r.value)} />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset class="bf__group">
            <legend class="label">Velocidad / potencia</legend>
            <div class="bf__choices">
              {SPEEDS.map((s) => (
                <label class="choice" key={s.label}>
                  <input type="radio" name="speed" checked={speed === s.value} onChange={() => setSpeed(s.value)} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div class="bf__nav">
            <button type="button" class="btn btn--ghost" onClick={() => setStep(0)}>
              Atrás
            </button>
            <button type="button" class="btn btn--primary btn--lg" onClick={() => setStep(2)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <fieldset class="bf__step">
          <legend>
            <h2>¿Tienes un tipo en mente?</h2>
            <p class="muted">Opcional. Si no eliges, buscamos en todo el catálogo.</p>
          </legend>
          <div class="bf__choices">
            {TYPES.map((t) => (
              <label class="choice" key={t}>
                <input type="checkbox" checked={types.includes(t)} onChange={() => toggle(types, t, setTypes)} />
                {categoryNames[t] ?? t}
              </label>
            ))}
          </div>
          <div class="bf__nav">
            <button type="button" class="btn btn--ghost" onClick={() => setStep(1)}>
              Atrás
            </button>
            <button type="button" class="btn btn--primary btn--lg" onClick={finish} data-finder-finish>
              Ver mi recomendación
            </button>
          </div>
        </fieldset>
      )}

      {step === 3 && results && (
        <section id="finder-results" tabindex={-1} class="bf__results" aria-live="polite">
          <h2>Estas son las motos que mejor encajan contigo</h2>
          <p class="muted">Ordenadas por compatibilidad con tus respuestas.</p>
          <ol role="list" class="bf__list">
            {results.map((r, i) => {
              const s = effectiveSpecs(r.product);
              return (
                <li key={r.product.slug} class="card bf__card" data-finder-result>
                  <img src={images[r.product.slug]} alt="" width="320" height="200" loading={i === 0 ? 'eager' : 'lazy'} />
                  <div class="bf__cardbody">
                    <div class="bf__score" aria-label={`Compatibilidad ${r.score}%`}>
                      <span style={`--w:${r.score}%`} />
                      <strong>{r.score}%</strong>
                    </div>
                    <h3>{r.product.name}</h3>
                    <p class="muted">{r.product.subtitle}</p>
                    <p class="specs-inline">
                      <span>
                        <strong>{maxRange(r.product)}</strong> km
                      </span>
                      <span>
                        <strong>{s.topSpeedKmh}</strong> km/h
                      </span>
                      <span>
                        <strong>{kw(s.powerW)}</strong>
                      </span>
                    </p>
                    {r.reasons.length > 0 && (
                      <ul class="bf__reasons">
                        {r.reasons.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    )}
                    <div class="bf__cardfoot">
                      <span>
                        Desde <strong>{formatMoney(fromPrice(r.product))}</strong>
                      </span>
                      <a href={`/motos-electricas/${r.product.slug}`} class="btn btn--primary btn--sm">
                        Ver modelo
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div class="bf__nav">
            <button type="button" class="btn btn--ghost" onClick={restart}>
              Volver a empezar
            </button>
            <a href="/motos-electricas" class="btn btn--secondary">
              Ver todo el catálogo
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
