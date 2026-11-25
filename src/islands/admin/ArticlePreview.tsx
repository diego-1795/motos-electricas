import type { ImageRef } from '../../domain/types';
import { validateBlogHtml } from '../../domain/blogHtml';

interface Props {
  title: string;
  description: string;
  categoryLabel: string;
  /** AAAA-MM-DD del formulario */
  publishedAt: string;
  author: string;
  minutes: number;
  image: ImageRef | undefined;
  /** HTML del editor visual (lista blanca de blogHtml.ts) */
  body: string;
  related: string[];
}

const fmtDate = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function formatDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? 'Sin fecha' : fmtDate.format(d);
}

/**
 * Vista previa de la página completa del artículo (ADR-036): cabecera, foto, texto y modelos relacionados con
 * los mismos estilos que la web (.prose). La foto no se puede mostrar aquí (se procesa al publicar), así que
 * se indica su sitio con su texto alternativo. El texto solo se pinta si cumple la lista blanca de blogHtml.ts.
 */
export default function ArticlePreview({ title, description, categoryLabel, publishedAt, author, minutes, image, body, related }: Props) {
  const bodyErrors = validateBlogHtml(body);
  return (
    <section class="adm-preview" aria-label="Vista previa del artículo" data-admin-preview>
      <p class="adm-preview__note">Vista previa: así se verá el artículo en la web. No se guarda nada hasta que pulses un botón de guardar.</p>
      <article class="adm-preview__page">
        <header class="adm-preview__head">
          <p class="eyebrow">{categoryLabel}</p>
          <h1>{title.trim() || <span class="muted">(Sin título)</span>}</h1>
          {description.trim() && <p class="muted adm-preview__lead">{description.trim()}</p>}
          <p class="muted adm-preview__meta">
            {formatDay(publishedAt)} · {minutes} min de lectura · {author.trim() || 'Sin autor'}
          </p>
        </header>
        {image && (
          <figure class="adm-preview__figure" data-admin-preview-photo>
            <span>Aquí irá la foto del artículo: «{image.alt || 'sin texto alternativo'}». Las fotos las pone el administrador.</span>
          </figure>
        )}
        {bodyErrors.length ? (
          <p class="adm-status adm-status--error is-visible" role="alert">
            El texto tiene algo que la web no aceptaría; vuelve a editar y revísalo.
          </p>
        ) : body.trim() ? (
          // Seguro: es HTML de la lista blanca, comprobado justo arriba con el mismo validador que el servidor
          <div class="prose adm-preview__body" dangerouslySetInnerHTML={{ __html: body }} />
        ) : (
          <p class="muted">Todavía no hay texto.</p>
        )}
        {related.length > 0 && (
          <section class="adm-preview__related" aria-label="Modelos relacionados">
            <h2>Modelos relacionados</h2>
            <ul role="list">
              {related.map((name) => (
                <li key={name} class="card">
                  {name}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </section>
  );
}
