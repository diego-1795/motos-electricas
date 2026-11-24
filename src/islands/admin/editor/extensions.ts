import { Extension, Mark, Node, mergeAttributes, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { CALLOUTS, TEXT_COLORS, VIDEO_LINK_TEXT, isSafeBlogHref, youtubeWatchUrl, type CalloutKind, type TextColor } from '../../../domain/blogHtml';

/**
 * Extensiones del editor visual del blog (ADR-031). Todo lo que producen está en la lista blanca de
 * src/domain/blogHtml.ts: colores y avisos por clase (nunca style=), vídeo como enlace a YouTube que la
 * web convierte en reproductor al pulsar, centrado por clase.
 */

/** Color del texto: solo la paleta de la marca, como <span class="tc-azul"> */
export const TextColorMark = Mark.create({
  name: 'textColor',
  addAttributes() {
    return {
      color: {
        default: null as TextColor | null,
        parseHTML: (el: HTMLElement) => TEXT_COLORS.find((c) => el.classList.contains(`tc-${c}`)) ?? null,
        renderHTML: (attrs: { color?: TextColor | null }) => (attrs.color ? { class: `tc-${attrs.color}` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span', getAttrs: (el) => (TEXT_COLORS.some((c) => (el as HTMLElement).classList.contains(`tc-${c}`)) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});

/** Resaltado (un único color de la marca) */
export const HighlightMark = Mark.create({
  name: 'highlight',
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML() {
    return ['mark', 0];
  },
});

/** Centrar párrafos y títulos con la clase al-centro */
export const Align = Extension.create({
  name: 'align',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          align: {
            default: null as 'center' | null,
            parseHTML: (el: HTMLElement) => (el.classList.contains('al-centro') ? 'center' : null),
            renderHTML: (attrs: { align?: string | null }) => (attrs.align === 'center' ? { class: 'al-centro' } : {}),
          },
        },
      },
    ];
  },
});

/** Caja de aviso: <aside class="aviso aviso--consejo|importante"> con párrafos y listas dentro */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: '(paragraph | heading | bulletList | orderedList)+',
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'consejo' as CalloutKind,
        parseHTML: (el: HTMLElement) => CALLOUTS.find((k) => el.classList.contains(`aviso--${k}`)) ?? 'consejo',
        renderHTML: (attrs: { kind?: CalloutKind }) => ({ class: `aviso aviso--${attrs.kind ?? 'consejo'}` }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'aside.aviso' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', HTMLAttributes, 0];
  },
});

const YT_ID = /^[\w-]{11}$/;

/** Vídeo de YouTube: en el fichero, un enlace dentro de <figure>; la web lo convierte en reproductor al pulsar */
export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      id: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-youtube'),
        renderHTML: (attrs: { id?: string | null }) => (attrs.id ? { 'data-youtube': attrs.id } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure.blog-video', getAttrs: (el) => (YT_ID.test((el as HTMLElement).getAttribute('data-youtube') ?? '') ? null : false) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const id = String(node.attrs.id ?? '');
    return ['figure', mergeAttributes({ class: 'blog-video' }, HTMLAttributes), ['a', { href: youtubeWatchUrl(id) }, VIDEO_LINK_TEXT]];
  },
});

export function blogExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false,
      codeBlock: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        // Sin target ni rel: los enlaces internos (/repuestos) no deben abrir pestañas nuevas
        HTMLAttributes: { target: null, rel: null, class: null },
        isAllowedUri: (url) => isSafeBlogHref(url),
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    TextColorMark,
    HighlightMark,
    Align,
    Callout,
    Video,
  ];
}
