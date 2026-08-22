import { site } from '../../config/site';

export interface PageMeta {
  title: string;
  description: string;
  /** Ruta absoluta del sitio, p.ej. /motos-electricas/odin-1-0 */
  path: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
  noindex?: boolean;
}

export function buildTitle(title: string): string {
  return title.includes(site.name) ? title : `${title} · ${site.name}`;
}

export function canonical(path: string): string {
  const clean = path.replace(/\/+$/, '') || '/';
  return `${site.url}${clean === '/' ? '' : clean}`;
}

export function absolute(pathOrUrl: string): string {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${site.url}${pathOrUrl}`;
}

/** Trunca descripciones a un rango razonable para SERP */
export function clampDescription(text: string, max = 158): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s\S*$/, '')}…`;
}
