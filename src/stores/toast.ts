import { atom } from 'nanostores';

export interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  actionHref?: string;
}

export const $toast = atom<Toast | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, action?: { label: string; href: string }): void {
  $toast.set({ id: ++seq, text, actionLabel: action?.label, actionHref: action?.href });
  clearTimeout(timer);
  timer = setTimeout(() => $toast.set(null), 3500);
}
