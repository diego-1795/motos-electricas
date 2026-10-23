import { useState } from 'preact/hooks';
import type { CategorySlug, Product, UseCase } from '../domain/types';
import { recommend, useCaseLabel, type FinderAnswers, type Recommendation } from '../domain/recommendation';
import { formatMoney } from '../domain/money';
import { fromPrice, effectiveSpecs, maxRange, powerLabel } from '../domain/product';
import { track } from '../services/analytics/AnalyticsService';
import { ALL_PRODUCTS_PATH, productPath } from '../lib/routes';

/**
 * "Encuentra tu bicimoto": 3 pasos, sin dependencias. Recibe los productos
 * serializados (el catálogo es pequeño); la puntuación vive en domain/recommendation.
 * Pasos: ¿para qué la usarás? · ¿cuántos km al día? + presupuesto · ¿llevarás carga?
 * (todas las bicimotos van a 25 km/h, por eso no se pregunta la velocidad).
 */
interface Props {
  products: Product[];
  images: Record<string, string>;
  categoryNames: Record<string, string>;
}

const USES: UseCase[] = ['ciudad', 'trabajo', 'reparto', 'ocio', 'carga'];
const BUDGETS = [
  { label: 'Hasta S/ 1,000', value: 100000 },
  { label: 'Hasta S/ 1,500', value: 150000 },
  { label: 'Hasta S/ 2,000', value: 200000 },
  { label: 'Hasta S/ 3,000', value: 300000 },
  { label: 'Sin límite', value: undefined },
];
/* km/día → autonomía mínima recomendada (margen para no cargar a diario) */
const DAILY_KM = [
  { label: 'Menos de 15 km', value: 20 },
  { label: '15-30 km', value: 30 },
  { label: '30-45 km', value: 45 },
  { label: 'Más de 45 km', value: 60 },
];
const CARGO: { label: string; hint: string; types: CategorySlug[]; use?: UseCase }[] = [
  { label: 'No, solo yo (y a veces un acompañante)', hint: 'Bicimotos', types: ['bicimotos'] },
  { label: 'Sí, mercadería o carga pesada', hint: 'Trimotos de carga', types: ['trimotos'], use: 'carga' },
  { label: 'A veces, cosas ligeras', hint: 'Cualquier modelo', types: [] },
];

export default function BikeFinder({ products, images, categoryNames }: Props) {
  const [step, setStep] = useState(0);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [budget, setBudget] = useState<number | undefined | null>(null);
  const [range, setRange] = useState<number | null>(null);
  const [cargo, setCargo] = useState<number | null>(null);
  const [results, setResults] = useState<Recommendation[] | null>(null);

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const finish = () => {
    const c = cargo !== null ? CARGO[cargo] : undefined;
    const uses = c?.use && !useCases.includes(c.use) ? [...useCases, c.use] : useCases;
    const answers: FinderAnswers = {
      useCases: uses,
      budgetMax: budget ?? undefined,
      rangeMin: range ?? undefined,
      types: c?.types ?? [],
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
    setCargo(null);
    setResults(null);
  };

  return (
    <div class="bf" data-finder>
      {step < 3 && (
        <ol class="bf__progress" role="list" aria-label="Progreso">
          {['Uso', 'Distancia y presupuesto', 'Carga'].map((l, i) => (
            <li key={l} class={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              {l}
            </li>
          ))}
        </ol>
      )}

      {step === 0 && (
        <fieldset class="bf__step">
          <legend>
            <h2>¿Para qué la usarás?</h2>
            <p class="muted">Elige todo lo que aplique.</p>
          </legend>
          <div class="bf__choices">
            {USES.map((u) => (
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
          <h2>Distancia y presupuesto</h2>
          <fieldset class="bf__group">
            <legend class="label">¿Cuántos km recorrerás al día?</legend>
            <div class="bf__choices">
              {DAILY_KM.map((r) => (
                <label class="choice" key={r.label}>
                  <input type="radio" name="range" checked={range === r.value} onChange={() => setRange(r.value)} />
                  {r.label}
                </label>
              ))}
            </div>
            <p class="hint">Las bicimotos RAIDEN recorren 30-50 km por carga según la versión; la trimoto, hasta 40 km.</p>
          </fieldset>
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
            <h2>¿Llevarás carga?</h2>
            <p class="muted">Si transportas mercadería, te recomendaremos una trimoto.</p>
          </legend>
          <div class="bf__choices bf__choices--stack">
            {CARGO.map((c, i) => (
              <label class="choice" key={c.label}>
                <input type="radio" name="cargo" checked={cargo === i} onChange={() => setCargo(i)} />
                {c.label}
                <span class="muted" style="font-weight:400">
                  · {c.hint}
                </span>
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
          <h2>Estas son las bicimotos que mejor encajan contigo</h2>
          <p class="muted">Ordenadas por compatibilidad con tus respuestas.</p>
          <ol role="list" class="bf__list">
            {results.map((r, i) => {
              const s = effectiveSpecs(r.product);
              return (
                <li key={r.product.slug} class="card bf__card" data-finder-result>
                  <img src={images[r.product.slug]} alt="" width="320" height="400" loading={i === 0 ? 'eager' : 'lazy'} />
                  <div class="bf__cardbody">
                    <div class="bf__score" aria-label={`Compatibilidad ${r.score}%`}>
                      <span style={`--w:${r.score}%`} />
                      <strong>{r.score}%</strong>
                    </div>
                    <h3>{r.product.name}</h3>
                    <p class="muted">
                      {categoryNames[r.product.category] ?? r.product.category} · {r.product.subtitle}
                    </p>
                    <p class="specs-inline">
                      <span>
                        <strong>{powerLabel(s.powerW)}</strong>
                      </span>
                      <span>
                        <strong>{maxRange(r.product)}</strong> km
                      </span>
                      <span>
                        <strong>{s.topSpeedKmh}</strong> km/h
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
                      <a href={productPath(r.product)} class="btn btn--primary btn--sm">
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
            <a href={ALL_PRODUCTS_PATH} class="btn btn--secondary">
              Ver todos los productos
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
