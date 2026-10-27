import { useRef, useState } from 'preact/hooks';
import { useAdmin } from './context';

interface Props {
  hidden: boolean;
  /** Nombre de la ficha (para el nombre accesible) */
  name: string;
  onChange: (hidden: boolean) => Promise<void>;
  testId?: string;
}

/** Interruptor "Oculto": retira la ficha de toda la web sin borrarla (hidden: true). */
export default function HiddenToggle({ hidden, name, onChange, testId }: Props) {
  const { handleError } = useAdmin();
  const [busy, setBusy] = useState(false);
  // Guardia síncrona: el estado `busy` del render puede ir un tick por detrás de un doble clic
  const busyRef = useRef(false);

  const toggle = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onChange(!hidden);
    } catch (err) {
      handleError(err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // aria-disabled en vez de disabled: un botón deshabilitado pierde el foco y el usuario de teclado
  // o lector de pantalla no sabe dónde está ni oye el resultado (aria-checked) al terminar.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={hidden}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      class="adm-switch"
      onClick={() => void toggle()}
      data-hidden-toggle={testId}
    >
      <span class="adm-switch__track" aria-hidden="true">
        <span class="adm-switch__thumb" />
      </span>
      <span class="adm-switch__text">
        Oculto<span class="visually-hidden">: {name}</span>
      </span>
    </button>
  );
}
