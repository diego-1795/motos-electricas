import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FrontmatterError, parseFrontmatter, serializeFrontmatter, splitFrontmatter } from '../../src/domain/frontmatter';
import { serializePost } from '../../functions/api/admin/_lib/blog';
import { blogSchema } from '../../src/content/schemas';

/** Lectura/escritura determinista del frontmatter de los artículos (ADR-023). */

const BLOG_DIR = join(process.cwd(), 'src/content/blog');
const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));

const sample = `---
title: "Cómo cuidar la batería"
description: "Guía \\"práctica\\": cuándo cargar, cuánto tiempo."
category: "baterias"
publishedAt: "2026-10-27T08:00:00.000Z"
author: "Equipo Raiden"
image:
  src: "~/assets/blog/bateria.webp"
  alt: "Batería Chilwee"
  width: 1264
  height: 848
relatedProducts: ["golden-eagle", "royal-tiger"]
---

Primer párrafo con **negrita**.

## Sección

- uno
- dos
`;

describe('parseFrontmatter', () => {
  it('lee el subconjunto YAML del proyecto: cadenas, números, listas en línea y objetos anidados', () => {
    const { data, body } = parseFrontmatter(sample);
    expect(data).toEqual({
      title: 'Cómo cuidar la batería',
      description: 'Guía "práctica": cuándo cargar, cuánto tiempo.',
      category: 'baterias',
      publishedAt: '2026-10-27T08:00:00.000Z',
      author: 'Equipo Raiden',
      image: { src: '~/assets/blog/bateria.webp', alt: 'Batería Chilwee', width: 1264, height: 848 },
      relatedProducts: ['golden-eagle', 'royal-tiger'],
    });
    expect(body).toBe('Primer párrafo con **negrita**.\n\n## Sección\n\n- uno\n- dos\n');
  });

  it('acepta listas en bloque, comillas simples, escalares planos y booleanos; ignora comentarios', () => {
    const { data } = parseFrontmatter(`---\n# comentario\ntitle: 'It''s ok'\nflag: true\nn: 3\nplain: texto plano\nrelatedProducts:\n  - golden-eagle\n  - "royal-tiger"\nempty: []\n---\ncuerpo`);
    expect(data).toEqual({ title: "It's ok", flag: true, n: 3, plain: 'texto plano', relatedProducts: ['golden-eagle', 'royal-tiger'], empty: [] });
  });

  it('sin frontmatter devuelve data vacío y todo el texto como cuerpo', () => {
    expect(parseFrontmatter('solo texto')).toEqual({ data: {}, body: 'solo texto' });
    expect(splitFrontmatter('---\na: 1\n---').body).toBe('');
  });

  it('rechaza lo que no entiende (tabuladores, bloques multilínea, anclas, claves repetidas, __proto__) con la línea', () => {
    const bad = ['---\na: 1\n', '---\n\ttitle: x\n---\n', '---\ntitle: |\n  multi\n---\n', '---\na: &x 1\n---\n', '---\na: 1\na: 2\n---\n', '---\n__proto__: {}\n---\n', '---\na: [1, [2]]\n---\n', '---\na: "sin cerrar\n---\n', '---\na:\n    b: 1\n  c: 2\n---\n'];
    for (const b of bad) {
      expect(() => parseFrontmatter(b), JSON.stringify(b)).toThrow(FrontmatterError);
    }
    expect(() => parseFrontmatter('---\nok: 1\n\tmal: 2\n---\n')).toThrow(/línea 3/);
  });
});

describe('serializeFrontmatter', () => {
  it('ida y vuelta exacta sobre el ejemplo canónico', () => {
    const { data, body } = parseFrontmatter(sample);
    expect(serializeFrontmatter(data, body)).toBe(sample);
  });

  it('omite undefined/null, normaliza saltos de línea y deja una sola línea final', () => {
    expect(serializeFrontmatter({ a: 'x', b: undefined, c: null, d: ['y', 2, true] }, '\r\n\r\ntexto\r\n\r\n')).toBe('---\na: "x"\nd: ["y", 2, true]\n---\n\ntexto\n');
    expect(serializeFrontmatter({ a: 1 }, '')).toBe('---\na: 1\n---\n');
  });

  it('rechaza listas de objetos y claves no válidas', () => {
    expect(() => serializeFrontmatter({ a: [{ b: 1 }] as never }, '')).toThrow(/escalares/);
    expect(() => serializeFrontmatter({ 'mala clave': 1 }, '')).toThrow(/clave/);
  });

  it('las comillas dobles de JSON escapan lo que YAML necesita (saltos, comillas, barras)', () => {
    const data = { t: 'línea 1\nlínea "2" \\ fin', u: 'con: dos puntos y #almohadilla' };
    const text = serializeFrontmatter(data, 'b');
    expect(parseFrontmatter(text).data).toEqual(data);
  });
});

describe('artículos reales de src/content/blog', () => {
  it('hay artículos y todos se leen, pasan blogSchema y sobreviven a parse → serializePost → parse', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(join(BLOG_DIR, f), 'utf8');
      const { data, body } = parseFrontmatter(text);
      const parsed = blogSchema.strict().safeParse(data);
      expect(parsed.success, `${f}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
      if (!parsed.success) continue;
      const again = parseFrontmatter(serializePost(parsed.data, body));
      expect(again.data, f).toEqual(data);
      expect(again.body, f).toBe(body.replace(/\s+$/, '') + '\n');
    }
  });

  it('al menos un artículo del repo ya está en la forma canónica que escribe el panel (sin diff al guardar sin cambios)', () => {
    const canonical = files.filter((f) => {
      const text = readFileSync(join(BLOG_DIR, f), 'utf8');
      const { data, body } = parseFrontmatter(text);
      const parsed = blogSchema.strict().safeParse(data);
      return parsed.success && serializePost(parsed.data, body) === text;
    });
    expect(canonical.length, 'ficheros canónicos').toBeGreaterThan(0);
  });
});
