import { useRef, useState } from 'preact/hooks';
import { fileToBase64, formatBytes, useAdmin } from './context';

interface Props {
  /** Slug del producto: el PDF se guarda como public/docs/<slug>-<suffix>.pdf */
  slug: string;
  suffix: 'manual' | 'ficha';
  /** Rellena el campo de URL con `/docs/<slug>-<suffix>.pdf` */
  onUploaded: (ref: string) => void;
}

type Stage = { kind: 'idle' } | { kind: 'uploading'; name: string } | { kind: 'done'; name: string; bytes: number } | { kind: 'error'; message: string };

const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Botón "Subir PDF" junto a un campo de URL del editor de producto (ADR-023). Un commit por fichero. */
export default function PdfUpload({ slug, suffix, onUploaded }: Props) {
  const { api, announce, handleError } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const label = suffix === 'manual' ? 'manual' : 'ficha técnica';

  const pick = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return setStage({ kind: 'error', message: 'Elige un fichero PDF' });
    if (file.size > MAX_PDF_BYTES) return setStage({ kind: 'error', message: `El PDF pesa ${formatBytes(file.size)}; el máximo es 10 MB (comprímelo antes)` });
    setStage({ kind: 'uploading', name: file.name });
    try {
      const contentBase64 = await fileToBase64(file);
      const result = await api.upload({ path: `public/docs/${slug}-${suffix}.pdf`, contentBase64 });
      onUploaded(result.ref);
      setStage({ kind: 'done', name: file.name, bytes: result.bytes });
      announce(result.commit, `PDF de ${label} subido (${formatBytes(result.bytes)}). Guarda la ficha para enlazarlo. Publicando…`);
    } catch (err) {
      setStage({ kind: 'error', message: handleError(err) });
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div class="adm-pdf" data-admin-pdf-upload={suffix}>
      <input ref={input} type="file" accept="application/pdf,.pdf" class="adm-pdf__input" onChange={(e) => void pick(e)} aria-label={`Elegir PDF de ${label}`} disabled={stage.kind === 'uploading'} />
      <button type="button" class="btn btn--secondary btn--sm" onClick={() => input.current?.click()} disabled={stage.kind === 'uploading'}>
        {stage.kind === 'uploading' ? 'Subiendo…' : 'Subir PDF'}
      </button>
      {stage.kind === 'done' && (
        <span class="hint" role="status">
          {stage.name} subido ({formatBytes(stage.bytes)})
        </span>
      )}
      {stage.kind === 'error' && (
        <span class="adm-error" role="alert">
          {stage.message}
        </span>
      )}
    </div>
  );
}
