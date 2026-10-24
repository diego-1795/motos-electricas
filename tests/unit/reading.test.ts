import { describe, it, expect } from 'vitest';
import { countWords, markdownToText, readingMinutes, WORDS_PER_MINUTE } from '../../src/domain/reading';

describe('markdownToText', () => {
  it('quita encabezados, énfasis, enlaces y código, conservando el texto', () => {
    const md = '## Título\n\nTexto **negrita** y _cursiva_ con [un enlace](https://x.test/a) y `code`.\n\n```js\nconst a = 1;\n```\n';
    const words = countWords(markdownToText(md));
    // Título, Texto, negrita, y, cursiva, con, un, enlace, y → 9
    expect(words).toBe(9);
  });

  it('ignora separadores y pipes de tablas, pero cuenta las celdas', () => {
    const md = '| Modelo | Precio |\n|---|---|\n| Golden Eagle | S/ 1,200 |\n';
    // Modelo, Precio, Golden, Eagle, S/, 1,200 → 6 (los "|" y "---" no cuentan)
    expect(countWords(markdownToText(md))).toBe(6);
  });
});

describe('countWords', () => {
  it('no cuenta signos sueltos', () => {
    expect(countWords('— · | ...')).toBe(0);
    expect(countWords('uno dos  tres\ncuatro')).toBe(4);
  });
});

describe('readingMinutes', () => {
  const word = 'palabra ';
  it('redondea a minutos sobre 200 ppm, con mínimo 1', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes(word.repeat(50))).toBe(1);
    expect(readingMinutes(word.repeat(400))).toBe(2);
    expect(readingMinutes(word.repeat(899))).toBe(4);
    expect(readingMinutes(word.repeat(900))).toBe(5);
  });

  it('admite otra velocidad', () => {
    expect(readingMinutes(word.repeat(300), 100)).toBe(3);
    expect(WORDS_PER_MINUTE).toBe(200);
  });
});
