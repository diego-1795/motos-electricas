import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { applyFormat, insertLink, isSafeHref, normalizeHref, parseBlocks, type Block, type FormatKind, type Inline, type TextEdit } from '../../domain/markdownLite';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** id de la ayuda bajo el cuadro (aria-describedby) */
  describedBy?: string;
}

const BUTTONS: { kind: FormatKind; label: string; title: string; class?: string }[] = [
  { kind: 'heading', label: 'Título', title: 'Título de sección' },
  { kind: 'bold', label: 'Negrita', title: 'Negrita (Ctrl+B)', class: 'adm-md__b' },
  { kind: 'italic', label: 'Cursiva', title: 'Cursiva (Ctrl+I)', class: 'adm-md__i' },
  { kind: 'bullets', label: '• Lista', title: 'Lista con viñetas' },
  { kind: 'numbers', label: '1. Lista', title: 'Lista numerada' },
];

function renderInline(nodes: Inline[]): ComponentChildren {
  return nodes.map((n, i) => {
    if (n.t === 'text') return n.v;
    if (n.t === 'a')
      return (
        <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
          {renderInline(n.c)}
        </a>
      );
    return n.t === 'b' ? <strong key={i}>{renderInline(n.c)}</strong> : <em key={i}>{renderInline(n.c)}</em>;
  });
}

function renderBlock(b: Block, i: number) {
  if ('items' in b) {
    const items = b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>);
    return b.t === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
  }
  if (b.t === 'h2') return <h3 key={i}>{renderInline(b.c)}</h3>;
  if (b.t === 'h3') return <h4 key={i}>{renderInline(b.c)}</h4>;
  return <p key={i}>{renderInline(b.c)}</p>;
}

/**
 * Cuadro de texto del artículo con barra de formato y vista previa (ADR-027). Por debajo sigue
 * siendo Markdown (lo que guarda el repositorio), pero quien escribe no tiene que saberlo: los
 * botones ponen las marcas y la vista previa enseña cómo quedará. La vista previa se pinta con
 * elementos de Preact (sin innerHTML) y solo enlaza direcciones seguras.
 */
export default function MarkdownEditor({ id, label, value, onChange, describedBy }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingSel = useRef<{ start: number; end: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [link, setLink] = useState<{ start: number; end: number; label: string; href: string; error: string } | null>(null);

  // Tras aplicar un formato, recolocar la selección y el foco en el cuadro
  useLayoutEffect(() => {
    const sel = pendingSel.current;
    const ta = ref.current;
    if (!sel || !ta) return;
    pendingSel.current = null;
    ta.focus();
    ta.setSelectionRange(sel.start, sel.end);
  });

  const commit = (edit: TextEdit) => {
    pendingSel.current = { start: edit.start, end: edit.end };
    onChange(edit.text);
  };

  const format = (kind: FormatKind) => {
    const ta = ref.current;
    if (!ta) return;
    commit(applyFormat(value, ta.selectionStart, ta.selectionEnd, kind));
  };

  const openLink = () => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setLink({ start, end, label: value.slice(start, end).trim(), href: '', error: '' });
  };

  const confirmLink = () => {
    if (!link) return;
    const href = normalizeHref(link.href);
    if (!href || !isSafeHref(href)) {
      setLink({ ...link, error: 'Escribe una dirección que empiece por https://, por / (una página de la tienda, p. ej. /repuestos) o por mailto:' });
      return;
    }
    const edit = insertLink(value, link.start, link.end, link.label, href);
    setLink(null);
    commit(edit);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i' || k === 'k') {
      e.preventDefault();
      if (k === 'k') openLink();
      else format(k === 'b' ? 'bold' : 'italic');
    }
  };

  // Enter en los campos del enlace inserta el enlace (y no envía el formulario del artículo)
  const linkKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmLink();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setLink(null);
      ref.current?.focus();
    }
  };

  const blocks = preview ? parseBlocks(value) : [];

  return (
    <div class="adm-md" data-admin-md>
      <label class="label" for={id}>
        {label}
      </label>
      <div class="adm-md__bar" role="group" aria-label="Formato del texto">
        {BUTTONS.map((b) => (
          <button key={b.kind} type="button" class={`btn btn--ghost btn--sm ${b.class ?? ''}`} title={b.title} onClick={() => format(b.kind)} disabled={preview} data-admin-md-btn={b.kind}>
            {b.label}
          </button>
        ))}
        <button type="button" class="btn btn--ghost btn--sm" title="Enlace (Ctrl+K)" onClick={openLink} disabled={preview} data-admin-md-btn="link">
          Enlace
        </button>
        <span class="adm-md__spacer" />
        <button type="button" class="btn btn--secondary btn--sm" aria-pressed={preview} onClick={() => setPreview((p) => !p)} data-admin-md-preview>
          {preview ? 'Seguir escribiendo' : 'Vista previa'}
        </button>
      </div>

      {link && (
        <div class="adm-md__link" role="group" aria-label="Insertar enlace" data-admin-md-link>
          <label class="field">
            <span class="label">Texto que se verá</span>
            <input class="input" value={link.label} onInput={(e) => setLink({ ...link, label: (e.target as HTMLInputElement).value })} onKeyDown={linkKey} />
          </label>
          <label class="field">
            <span class="label">Dirección</span>
            <input
              class="input"
              value={link.href}
              onInput={(e) => setLink({ ...link, href: (e.target as HTMLInputElement).value, error: '' })}
              onKeyDown={linkKey}
              placeholder="https://… o /repuestos"
              inputMode="url"
              spellcheck={false}
              autoFocus
            />
          </label>
          <div class="adm-md__link-actions">
            <button type="button" class="btn btn--primary btn--sm" onClick={confirmLink}>
              Insertar enlace
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              onClick={() => {
                setLink(null);
                ref.current?.focus();
              }}
            >
              Cancelar
            </button>
          </div>
          {link.error && (
            <p class="adm-status adm-status--error is-visible" role="alert">
              {link.error}
            </p>
          )}
        </div>
      )}

      {/* El textarea sigue en el DOM durante la vista previa (oculto) para no perder la selección ni el historial de deshacer */}
      <textarea
        id={id}
        ref={ref}
        class="textarea adm-body"
        value={value}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        onKeyDown={onKeyDown}
        aria-describedby={describedBy}
        hidden={preview}
        spellcheck
        required
      />
      {preview && (
        <div class="adm-md__preview" aria-label="Vista previa del texto" role="region" data-admin-md-render>
          {blocks.length ? blocks.map(renderBlock) : <p class="muted">Todavía no hay texto.</p>}
        </div>
      )}
    </div>
  );
}
