import type { ImageRef } from '../../domain/types';

interface Props {
  value: ImageRef;
  onChange: (image: ImageRef) => void;
  /** Prefijo de los nombres accesibles ("Foto", "Imagen 2", "Foto del color Negro") */
  label: string;
  placeholder?: string;
}

/**
 * Una imagen del contenido como ruta + alt + ancho × alto (ADR-023: las fotos van por git en webp;
 * el panel solo escribe la referencia). Sin subida ni vista previa: los ficheros no están en el panel.
 */
export default function ImageFields({ value, onChange, label, placeholder }: Props) {
  const set = (patch: Partial<ImageRef>) => onChange({ ...value, ...patch });
  const num = (v: string) => (v.trim() === '' ? 0 : Number(v));
  return (
    <div class="adm-image">
      <label class="field adm-image__src">
        <span class="label">Ruta de la foto (webp en src/assets)</span>
        <input class="input" value={value.src} onInput={(e) => set({ src: (e.target as HTMLInputElement).value })} placeholder={placeholder ?? '~/assets/products/<slug>-<color>.webp'} spellcheck={false} aria-label={`${label}: ruta`} data-admin-image-src />
      </label>
      <label class="field adm-image__alt">
        <span class="label">Texto alternativo</span>
        <input class="input" value={value.alt} onInput={(e) => set({ alt: (e.target as HTMLInputElement).value })} placeholder="Qué se ve en la foto" aria-label={`${label}: texto alternativo`} />
      </label>
      <label class="field adm-image__dim">
        <span class="label">Ancho (px)</span>
        <input class="input" type="number" min={1} value={value.width} onInput={(e) => set({ width: num((e.target as HTMLInputElement).value) })} aria-label={`${label}: ancho`} />
      </label>
      <label class="field adm-image__dim">
        <span class="label">Alto (px)</span>
        <input class="input" type="number" min={1} value={value.height} onInput={(e) => set({ height: num((e.target as HTMLInputElement).value) })} aria-label={`${label}: alto`} />
      </label>
    </div>
  );
}
