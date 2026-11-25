import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { MAX_STOCK } from '../../domain/stock';
import { useAdmin } from './context';

interface Props {
  /** Etiqueta visible (versión) — vacía para repuestos */
  label?: string;
  /** Nombre accesible, p. ej. "Stock Estándar de Golden Eagle" */
  name: string;
  /** Unidades actuales; undefined = sin control de stock */
  stock: number | undefined;
  onSave: (stock: number | null) => Promise<void>;
  testId?: string;
}

const toInput = (n: number | undefined): string => (n === undefined ? '' : String(n));

/**
 * Unidades en stock editables en la tabla (ADR-035), como el precio. Vacío = sin control de stock (manda la
 * disponibilidad puesta en la ficha). Al cambiar aparecen Guardar y Cancelar.
 */
export default function StockCell({ label, name, stock, onSave, testId }: Props) {
  const { handleError, reloadSeq } = useAdmin();
  const id = useId();
  const [text, setText] = useState(() => toInput(stock));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Si la ficha cambia desde fuera (guardado, recarga) se vuelve al valor real
  const synced = useRef({ stock, reloadSeq });
  useEffect(() => {
    if (synced.current.stock === stock && synced.current.reloadSeq === reloadSeq) return;
    synced.current = { stock, reloadSeq };
    setText(toInput(stock));
    setError(null);
  }, [stock, reloadSeq]);

  const dirty = text.trim() !== toInput(stock);

  const save = async (e: Event) => {
    e.preventDefault();
    if (savingRef.current) return;
    const t = text.trim();
    if (t && !/^\d+$/.test(t)) return setError('Escribe un número entero de unidades (o déjalo vacío)');
    const n = t ? Number(t) : null;
    if (n !== null && n > MAX_STOCK) return setError(`Como máximo ${MAX_STOCK} unidades`);
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(n);
    } catch (err) {
      setError(handleError(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form class={`adm-stock${dirty ? ' is-dirty' : ''}`} onSubmit={save} aria-busy={saving || undefined} data-stock-cell={testId}>
      <label class="adm-price__row">
        {label && <span class="adm-price__tier">{label}</span>}
        <input
          class="input adm-stock__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="—"
          aria-label={name}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-err` : `${id}-h`}
          value={text}
          readOnly={saving}
          onInput={(e) => {
            setText((e.target as HTMLInputElement).value);
            setError(null);
          }}
          data-stock-input={testId}
        />
        <span class="muted adm-stock__unit" id={`${id}-h`}>
          {stock === undefined ? 'sin control' : 'uds.'}
        </span>
      </label>
      {dirty && (
        <div class="adm-price__actions">
          <button type="submit" class="btn btn--primary btn--sm" aria-disabled={saving || undefined} data-stock-save={testId}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" class="btn btn--ghost btn--sm" onClick={() => setText(toInput(stock))} aria-disabled={saving || undefined}>
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <p id={`${id}-err`} class="adm-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
