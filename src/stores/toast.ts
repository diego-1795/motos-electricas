import { atom } from 'nanostores';

export interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  actionHref?: string;
}

/** Tiempo visible del aviso (docs/12-accessibility.md §8: ≥ 5 s, con forma de cerrarlo y de pausarlo). */
export const TOAST_MS = 5000;

export const $toast = atom<Toast | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, action?: { label: string; href: string }): void {
  $toast.set({ id: ++seq, text, actionLabel: action?.label, actionHref: action?.href });
  resumeToast();
}

export function dismissToast(): void {
  clearTimeout(timer);
  $toast.set(null);
}

/** Mientras el puntero o el foco están sobre el aviso no se cierra solo (WCAG 2.2.1). */
export function pauseToast(): void {
  clearTimeout(timer);
}

export function resumeToast(): void {
  clearTimeout(timer);
  if ($toast.get()) timer = setTimeout(() => $toast.set(null), TOAST_MS);
}
