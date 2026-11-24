import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Editor } from '@tiptap/core';
import { CALLOUTS, CALLOUT_LABEL, TEXT_COLORS, TEXT_COLOR_LABEL, isSafeBlogHref, type CalloutKind, type TextColor } from '../../../domain/blogHtml';
import { youtubeId } from '../../../domain/video';
import { blogExtensions } from './extensions';
import { cleanEditorHtml, normalizePastedHtml } from './html';

interface Props {
  id: string;
  label: string;
  /** HTML inicial del artículo (forma fija de blogHtml.ts); para cambiarlo desde fuera, cambia la `key` */
  value: string;
  onChange: (html: string) => void;
  /** id de la ayuda bajo el editor (aria-describedby) */
  describedBy?: string;
}

type Panel = { kind: 'link'; href: string; error: string } | { kind: 'video'; url: string; error: string } | null;

/** "raiden.com.pe/x" → "https://raiden.com.pe/x"; rutas, https y mailto tal cual */
function normalizeHref(href: string): string {
  const h = href.trim();
  if (/^www\.|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(h) && !/^[a-z]+:/i.test(h)) return `https://${h}`;
  return h;
}

/**
 * Editor visual del texto del artículo (ADR-031): se escribe como en Word, sin símbolos. Tiptap
 * (ProseMirror) por debajo; lo que guarda es HTML de la lista blanca de blogHtml.ts. Deshacer/rehacer,
 * listas que continúan con Enter, pegar desde Word/Google Docs y atajos (Ctrl+B, I, U, Z) son los del
 * propio editor.
 */
export default function VisualEditor({ id, label, value, onChange, describedBy }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const labelId = useId();
  const [, setTick] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => {
    if (!host.current) return;
    const editor = new Editor({
      element: host.current,
      extensions: blogExtensions(),
      content: value || '',
      editorProps: {
        attributes: {
          id,
          class: 'prose adm-ve__content',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-labelledby': labelId,
          ...(describedBy ? { 'aria-describedby': describedBy } : {}),
          spellcheck: 'true',
          'data-admin-ve': '',
        },
        transformPastedHTML: normalizePastedHtml,
      },
      onUpdate: ({ editor: ed }) => {
        onChangeRef.current(cleanEditorHtml(ed.getHTML()));
      },
      // Repinta la barra (estado de los botones) al crearse y con cada cambio de selección o contenido
      onCreate: () => setTick((t) => t + 1),
      onTransaction: () => setTick((t) => t + 1),
    });
    editorRef.current = editor;
    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // Se crea una sola vez; los cambios externos de `value` llegan por el efecto siguiente
  }, []);

  // `value` solo se lee al crear el editor. Un cambio desde fuera (p. ej. "Recuperar" el texto sin guardar)
  // se hace volviendo a montar el componente con otra `key`: sincronizarlo aquí pisaría lo recién escrito,
  // porque Preact agrupa los repintados y el valor puede llegar atrasado respecto al editor.

  const ed = editorRef.current;
  const active = (name: string, attrs?: Record<string, unknown>) => !!ed && ed.isActive(name, attrs);
  /** Botones de la barra: no roban el foco al texto (la selección se conserva) */
  const keep = (e: MouseEvent) => e.preventDefault();
  const run = (fn: (e: Editor) => void) => () => {
    if (ed) fn(ed);
  };

  const blockValue = active('heading', { level: 2 }) ? 'h2' : active('heading', { level: 3 }) ? 'h3' : 'p';
  const colorValue = ((ed?.getAttributes('textColor').color as TextColor | undefined) ?? '') as TextColor | '';
  const calloutValue = active('callout') ? ((ed?.getAttributes('callout').kind as CalloutKind | undefined) ?? 'consejo') : '';
  const centered = !!ed && (ed.isActive('paragraph', { align: 'center' }) || ed.isActive('heading', { align: 'center' }));
  const inTable = active('table');

  const btn = (key: string, text: string, title: string, onClick: () => void, pressed?: boolean, extraClass = '') => (
    <button
      key={key}
      type="button"
      class={`btn btn--ghost btn--sm adm-ve__btn ${extraClass}`}
      title={title}
      aria-label={title}
      aria-pressed={pressed === undefined ? undefined : pressed}
      onMouseDown={keep}
      onClick={onClick}
      disabled={!ed}
      data-ve={key}
    >
      {text}
    </button>
  );

  const openLink = () => {
    if (!ed) return;
    setPanel({ kind: 'link', href: (ed.getAttributes('link').href as string | undefined) ?? '', error: '' });
  };
  const applyLink = () => {
    if (!ed || panel?.kind !== 'link') return;
    const href = normalizeHref(panel.href);
    if (!href || !isSafeBlogHref(href)) {
      setPanel({ ...panel, error: 'Escribe una dirección que empiece por https://, por / (una página de la tienda, p. ej. /repuestos) o por mailto:' });
      return;
    }
    const { empty } = ed.state.selection;
    if (empty && !ed.isActive('link')) ed.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    else ed.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setPanel(null);
  };
  const applyVideo = () => {
    if (!ed || panel?.kind !== 'video') return;
    const vid = youtubeId(panel.url);
    if (!vid) {
      setPanel({ ...panel, error: 'Pega un enlace de YouTube, por ejemplo https://www.youtube.com/watch?v=… o https://youtu.be/…' });
      return;
    }
    ed.chain().focus().insertContent({ type: 'video', attrs: { id: vid } }).run();
    setPanel(null);
  };
  const panelKey = (apply: () => void) => (e: KeyboardEvent) => {
    // Enter aplica (y no envía el formulario del artículo); Escape cierra
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setPanel(null);
      ed?.commands.focus();
    }
  };

  const select = (labelText: string, key: string, val: string, options: [string, string][], onPick: (v: string) => void): JSX.Element => (
    <label class="adm-ve__select" key={key}>
      <span class="visually-hidden">{labelText}</span>
      <select class="select" value={val} onChange={(e) => onPick((e.target as HTMLSelectElement).value)} disabled={!ed} data-ve={key} title={labelText}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div class="adm-ve" data-admin-ve-root>
      <span class="label" id={labelId} onClick={() => ed?.commands.focus()}>
        {label}
      </span>
      <div class="adm-ve__bar" role="group" aria-label="Formato del texto">
        <div class="adm-ve__group">
          {select('Tipo de texto', 'block', blockValue, [['p', 'Texto normal'], ['h2', 'Título'], ['h3', 'Subtítulo']], (v) => {
            if (!ed) return;
            const c = ed.chain().focus();
            (v === 'p' ? c.setParagraph() : c.setHeading({ level: v === 'h2' ? 2 : 3 })).run();
          })}
        </div>
        <div class="adm-ve__group">
          {btn('bold', 'N', 'Negrita (Ctrl+B)', run((e) => e.chain().focus().toggleBold().run()), active('bold'), 'adm-ve__b')}
          {btn('italic', 'K', 'Cursiva (Ctrl+I)', run((e) => e.chain().focus().toggleItalic().run()), active('italic'), 'adm-ve__i')}
          {btn('underline', 'S', 'Subrayado (Ctrl+U)', run((e) => e.chain().focus().toggleUnderline().run()), active('underline'), 'adm-ve__u')}
          {btn('strike', 'T', 'Tachado', run((e) => e.chain().focus().toggleStrike().run()), active('strike'), 'adm-ve__s')}
        </div>
        <div class="adm-ve__group">
          {select('Color del texto', 'color', colorValue, [['', 'Color: normal'], ...TEXT_COLORS.map((c): [string, string] => [c, TEXT_COLOR_LABEL[c]])], (v) => {
            if (!ed) return;
            const c = ed.chain().focus();
            (v ? c.setMark('textColor', { color: v }) : c.unsetMark('textColor')).run();
          })}
          {btn('highlight', 'Resaltar', 'Resaltar', run((e) => e.chain().focus().toggleMark('highlight').run()), active('highlight'), 'adm-ve__mark')}
        </div>
        <div class="adm-ve__group">
          {btn('bullets', '• Lista', 'Lista con viñetas', run((e) => e.chain().focus().toggleBulletList().run()), active('bulletList'))}
          {btn('numbers', '1. Lista', 'Lista numerada', run((e) => e.chain().focus().toggleOrderedList().run()), active('orderedList'))}
          {btn(
            'center',
            'Centrar',
            'Centrar',
            run((e) => {
              const next = centered ? null : 'center';
              e.chain().focus().updateAttributes('paragraph', { align: next }).updateAttributes('heading', { align: next }).run();
            }),
            centered,
          )}
        </div>
        <div class="adm-ve__group">
          {btn('link', 'Enlace', 'Enlace (Ctrl+K)', openLink, active('link'))}
          {btn('table', 'Tabla', 'Insertar tabla', run((e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()))}
          {btn('quote', 'Cita', 'Cita', run((e) => e.chain().focus().toggleBlockquote().run()), active('blockquote'))}
          {select('Caja de aviso', 'callout', calloutValue, [['', 'Aviso: ninguno'], ...CALLOUTS.map((k): [string, string] => [k, `Aviso: ${CALLOUT_LABEL[k]}`])], (v) => {
            if (!ed) return;
            const c = ed.chain().focus();
            if (!v) c.lift('callout').run();
            else if (ed.isActive('callout')) c.updateAttributes('callout', { kind: v }).run();
            else c.wrapIn('callout', { kind: v }).run();
          })}
          {btn('video', 'Vídeo', 'Insertar vídeo de YouTube', () => setPanel({ kind: 'video', url: '', error: '' }))}
          {btn('hr', 'Línea', 'Línea separadora', run((e) => e.chain().focus().setHorizontalRule().run()))}
        </div>
        <div class="adm-ve__group">
          {btn('undo', 'Deshacer', 'Deshacer (Ctrl+Z)', run((e) => e.chain().focus().undo().run()))}
          {btn('redo', 'Rehacer', 'Rehacer (Ctrl+Shift+Z)', run((e) => e.chain().focus().redo().run()))}
        </div>
      </div>

      {inTable && (
        <div class="adm-ve__bar adm-ve__bar--table" role="group" aria-label="Tabla" data-ve-table>
          {btn('row-add', '+ Fila', 'Añadir fila debajo', run((e) => e.chain().focus().addRowAfter().run()))}
          {btn('col-add', '+ Columna', 'Añadir columna a la derecha', run((e) => e.chain().focus().addColumnAfter().run()))}
          {btn('row-del', '− Fila', 'Quitar esta fila', run((e) => e.chain().focus().deleteRow().run()))}
          {btn('col-del', '− Columna', 'Quitar esta columna', run((e) => e.chain().focus().deleteColumn().run()))}
          {btn('header-row', 'Fila de títulos', 'Primera fila como títulos', run((e) => e.chain().focus().toggleHeaderRow().run()))}
          {btn('table-del', 'Quitar tabla', 'Quitar la tabla', run((e) => e.chain().focus().deleteTable().run()), undefined, 'adm-btn-danger')}
        </div>
      )}

      {panel?.kind === 'link' && (
        <div class="adm-ve__panel" role="group" aria-label="Enlace" data-ve-panel="link">
          <label class="field">
            <span class="label">Dirección del enlace</span>
            <input
              class="input"
              value={panel.href}
              onInput={(e) => setPanel({ ...panel, href: (e.target as HTMLInputElement).value, error: '' })}
              onKeyDown={panelKey(applyLink)}
              placeholder="https://… o /repuestos"
              inputMode="url"
              spellcheck={false}
              autoFocus
            />
          </label>
          <div class="adm-ve__panel-actions">
            <button type="button" class="btn btn--primary btn--sm" onClick={applyLink}>
              {active('link') ? 'Cambiar enlace' : 'Poner enlace'}
            </button>
            {active('link') && (
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                onClick={() => {
                  ed?.chain().focus().extendMarkRange('link').unsetLink().run();
                  setPanel(null);
                }}
              >
                Quitar enlace
              </button>
            )}
            <button type="button" class="btn btn--ghost btn--sm" onClick={() => setPanel(null)}>
              Cancelar
            </button>
          </div>
          {panel.error && (
            <p class="adm-status adm-status--error is-visible" role="alert">
              {panel.error}
            </p>
          )}
        </div>
      )}

      {panel?.kind === 'video' && (
        <div class="adm-ve__panel" role="group" aria-label="Vídeo de YouTube" data-ve-panel="video">
          <label class="field">
            <span class="label">Enlace del vídeo de YouTube</span>
            <input
              class="input"
              value={panel.url}
              onInput={(e) => setPanel({ ...panel, url: (e.target as HTMLInputElement).value, error: '' })}
              onKeyDown={panelKey(applyVideo)}
              placeholder="https://www.youtube.com/watch?v=…"
              inputMode="url"
              spellcheck={false}
              autoFocus
            />
          </label>
          <div class="adm-ve__panel-actions">
            <button type="button" class="btn btn--primary btn--sm" onClick={applyVideo}>
              Insertar vídeo
            </button>
            <button type="button" class="btn btn--ghost btn--sm" onClick={() => setPanel(null)}>
              Cancelar
            </button>
          </div>
          {panel.error && (
            <p class="adm-status adm-status--error is-visible" role="alert">
              {panel.error}
            </p>
          )}
        </div>
      )}

      <div ref={host} class="adm-ve__host" />
    </div>
  );
}
