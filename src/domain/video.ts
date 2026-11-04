/**
 * URLs de vídeo de YouTube de la ficha de producto (`videoUrl`). Puro.
 * ProductTabs.astro extrae el id con la misma expresión y lo embebe desde youtube-nocookie.com.
 */

const ID_RE = /^[\w-]{11}$/;

/** Id de 11 caracteres de una URL de YouTube (watch?v=, youtu.be/, /shorts/, /embed/, /live/) o null. */
export function youtubeId(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') id = parts[1] ?? null;
  }
  return id && ID_RE.test(id) ? id : null;
}

/** Forma canónica `https://www.youtube.com/watch?v=<id>` (sin listas, tiempos ni parámetros de seguimiento) o null. */
export function normalizeYouTubeUrl(url: string): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
