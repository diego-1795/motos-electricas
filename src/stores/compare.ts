import { persistentAtom } from '@nanostores/persistent';
import { site } from '../config/site';
import { track } from '../services/analytics/AnalyticsService';

/** Slugs seleccionados para comparar (máx. site.compareLimit) */
export const $compare = persistentAtom<string[]>(site.compareStorageKey, [], {
  encode: JSON.stringify,
  decode: (raw) => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, site.compareLimit) : [];
    } catch {
      return [];
    }
  },
});

export function toggleCompare(slug: string): 'added' | 'removed' | 'full' {
  const cur = $compare.get();
  if (cur.includes(slug)) {
    $compare.set(cur.filter((s) => s !== slug));
    return 'removed';
  }
  if (cur.length >= site.compareLimit) return 'full';
  $compare.set([...cur, slug]);
  track({ name: 'compare_add', slug });
  return 'added';
}

export function removeCompare(slug: string): void {
  $compare.set($compare.get().filter((s) => s !== slug));
}

export function clearCompare(): void {
  $compare.set([]);
}
