import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { formatMoney, parseSoles, pen } from '../../domain/money';
import { centsToInput, useAdmin } from './context';

interface Props {
  /** Etiqueta visible (versión) — vacía para repuestos */
  label?: string;
  /** Nombre accesible del campo, p. ej. "Precio Estándar de Golden Eagle" */
  name: string;
  /** Importe actual en céntimos */
  amount: number;
  /** Comprobación previa al guardado (Premium ≥ Estándar); devuelve el error o null */
  validate?: (cents: number) => string | null;
  onSave: (cents: number, reason?: string) => Promise<void>;
  testId?: string;
}

/**
 * Precio editable en línea: input en soles ("1200", "1,200", "1200.50") → céntimos.
 * Al cambiar el valor aparecen "Motivo (opcional)", Guardar y Cancelar.
 */
export default function PriceCell({ label, name, amount, validate, onSave, testId }: Props) {
  const { handleError, reloadSeq } = useAdmin();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => centsToInput(amount));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Guardia síncrona contra el doble envío (Enter + clic) mientras el estado `saving` aún no se ha pintado
  const savingRef = useRef(false);
  // Tras guardar, la fila de acciones (donde estaba el foco) desaparece: se devuelve el foco al importe
  const refocus = useRef(false);

  // Si la ficha cambia desde fuera (guardado, recarga, 409) se vuelve al valor real.
  // Solo cuando cambian de verdad: el efecto también corre tras el montaje (en diferido) y, si el
  // usuario ya ha empezado a escribir, un reset incondicional le pisaría el texto.
  const synced = useRef({ amount, reloadSeq });
  useEffect(() => {
    if (synced.current.amount === amount && synced.current.reloadSeq === reloadSeq) return;
    synced.current = { amount, reloadSeq };
    setText(centsToInput(amount));
    setReason('');
    setError(null);
  }, [amount, reloadSeq]);

  const parsed = parseSoles(text);
  const dirty = text.trim() !== centsToInput(amount) && parsed !== amount;

  useEffect(() => {
    if (!refocus.current || dirty) return;
    refocus.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) inputRef.current?.focus();
  });

  const cancel = () => {
    if (savingRef.current) return;
    setText(centsToInput(amount));
    setReason('');
    setError(null);
    inputRef.current?.focus();
  };

  const save = async (e: Event) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (parsed === null) return setError('Importe no válido: escribe por ejemplo 1250, 1,250 o 1250.50');
    if (parsed <= 0) return setError('El importe debe ser mayor que 0');
    const v = validate?.(parsed);
    if (v) return setError(v);
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed, reason.trim() || undefined);
      refocus.current = true;
    } catch (err) {
      setError(handleError(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form class={`adm-price${dirty ? ' is-dirty' : ''}`} onSubmit={save} aria-busy={saving || undefined} data-price-cell={testId}>
      <label class="adm-price__row">
        {label && <span class="adm-price__tier">{label}</span>}
        <span class="adm-price__prefix" aria-hidden="true">
          S/
        </span>
        <input
          ref={inputRef}
          class="input adm-price__input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={name}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          value={text}
          readOnly={saving}
          onInput={(e) => {
            setText((e.target as HTMLInputElement).value);
            setError(null);
          }}
          data-price-input={testId}
        />
        <span class="adm-price__current muted">{formatMoney(pen(amount))}</span>
      </label>
      {dirty && (
        <div class="adm-price__actions">
          <input
            class="input adm-price__reason"
            type="text"
            maxLength={120}
            placeholder="Motivo (opcional)"
            aria-label={`Motivo del cambio de ${name}`}
            value={reason}
            readOnly={saving}
            onInput={(e) => setReason((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn btn--primary btn--sm" aria-disabled={saving || undefined} data-price-save={testId}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" class="btn btn--ghost btn--sm" onClick={cancel} aria-disabled={saving || undefined}>
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
