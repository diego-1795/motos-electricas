/**
 * Validación de subidas de ficheros del panel (ADR-023). Pura: la ejecuta el servidor antes de
 * escribir en GitHub. Solo se suben PDF (manual de uso / ficha técnica de un producto) a
 * public/docs/<nombre>.pdf. Las imágenes NUNCA se suben desde el panel: van por git en webp
 * (ADR-020) y el contenido solo lleva su ruta (`~/assets/…`).
 * Se comprueba la cabecera real del fichero (%PDF-), no la extensión ni el Content-Type.
 */

export type UploadKind = 'pdf';

/**
 * La Contents API de GitHub admite hasta 100 MB, pero una Pages Function tiene 128 MB de memoria y
 * el cuerpo llega en JSON+base64 (×1,33) y se decodifica en memoria (otra copia): 10 MB de PDF
 * ≈ 13,4 MB de cuerpo + 10 MB de bytes, con margen. Un manual de más de 10 MB debe comprimirse
 * antes (y tampoco es razonable para descargar desde un móvil).
 */
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = { pdf: 10 * 1024 * 1024 };

/** Rutas blancas: nombre kebab-case y extensión acorde al tipo. */
export const UPLOAD_PATH_RE: Record<UploadKind, RegExp> = {
  pdf: /^public\/docs\/([a-z0-9]+(?:-[a-z0-9]+)*)\.pdf$/,
};

export const MAX_UPLOAD_PATH_LENGTH = 120;

export interface UploadTarget {
  kind: UploadKind;
  path: string;
  /** Cómo se referencia desde el contenido: `/docs/x.pdf` */
  ref: string;
}

/** Ruta de destino válida → tipo y referencia pública; null si no está en la lista blanca. */
export function uploadTarget(path: unknown): UploadTarget | null {
  if (typeof path !== 'string' || path.length > MAX_UPLOAD_PATH_LENGTH) return null;
  const pdf = UPLOAD_PATH_RE.pdf.exec(path);
  if (pdf) return { kind: 'pdf', path, ref: `/docs/${pdf[1]}.pdf` };
  return null;
}

const ascii = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));

/** Tipo real del fichero por su cabecera (magic bytes) o null. */
export function sniffKind(bytes: Uint8Array): UploadKind | null {
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'pdf';
  return null;
}

/** Comprueba bytes contra el destino: tipo real = extensión y tamaño dentro del tope. Devuelve errores legibles. */
export function uploadErrors(target: UploadTarget, bytes: Uint8Array): string[] {
  const errs: string[] = [];
  if (sniffKind(bytes) !== target.kind) errs.push('el fichero no es un PDF (cabecera %PDF- ausente)');
  const max = MAX_UPLOAD_BYTES[target.kind];
  if (bytes.length === 0) errs.push('el fichero está vacío');
  if (bytes.length > max) errs.push(`el fichero pesa ${(bytes.length / 1024 / 1024).toFixed(1)} MB y el máximo es ${max / 1024 / 1024} MB`);
  return errs;
}
