import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Editor de ficha: ocupa más ancho */
  wide?: boolean;
}

/**
 * Diálogo modal nativo (<dialog>.showModal): foco atrapado, Escape cierra y el fondo queda inerte.
 * El padre lo desmonta al recibir onClose.
 */
export default function Modal({ title, onClose, children, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const unmounting = useRef(false);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      // close() dispara el evento "close": al desmontar no debe llamar a onClose
      // (si el padre acaba de abrir otro diálogo, lo cerraría).
      unmounting.current = true;
      if (d?.open) d.close();
    };
  }, []);

  return (
    <dialog ref={ref} class={`adm-modal${wide ? ' adm-modal--wide' : ''}`} aria-labelledby={id} onClose={() => !unmounting.current && onClose()}>
      <div class="adm-modal__head">
        <h2 id={id}>{title}</h2>
        <button type="button" class="btn btn--ghost btn--sm" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>
      <div class="adm-modal__body">{children}</div>
    </dialog>
  );
}
