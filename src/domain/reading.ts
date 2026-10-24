/**
 * Tiempo de lectura real de un artículo, calculado a partir de su cuerpo
 * Markdown (no de un valor escrito a mano en el frontmatter).
 */

/** Palabras por minuto de un lector medio de prosa en español. */
export const WORDS_PER_MINUTE = 200;

/** Deja solo el texto legible de un Markdown: sin código, HTML, URLs ni marcas de formato. */
export function markdownToText(md: string): string {
  return (
    md
      // bloques de código y código inline
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      // etiquetas HTML
      .replace(/<[^>]+>/g, ' ')
      // imágenes y enlaces: conservar el texto, quitar la URL
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
      // URLs sueltas
      .replace(/https?:\/\/\S+/g, ' ')
      // marcas de bloque: encabezados, citas, listas, separadores de tabla
      .replace(/^[ \t]*(#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, '')
      .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, ' ')
      .replace(/\|/g, ' ')
      // énfasis
      .replace(/[*_~]{1,3}/g, '')
  );
}

/** Número de palabras "de verdad" (con al menos una letra o cifra). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Minutos de lectura (mínimo 1) del cuerpo Markdown de un artículo. */
export function readingMinutes(markdown: string, wpm = WORDS_PER_MINUTE): number {
  const words = countWords(markdownToText(markdown));
  return Math.max(1, Math.round(words / wpm));
}
