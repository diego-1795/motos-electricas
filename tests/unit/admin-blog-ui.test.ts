import { describe, expect, it } from 'vitest';
import { toIsoDate } from '../../src/islands/admin/BlogEditor';
import { fileToBase64, formatBytes } from '../../src/islands/admin/context';

/** Utilidades puras de las islas del blog y de la subida de PDF (ADR-023). */

describe('toIsoDate (editor de artículo)', () => {
  it('conserva la fecha original (con hora) si el día no cambió y fija 08:00Z si cambió', () => {
    expect(toIsoDate('2026-10-27', '2026-10-27T08:00:00.000Z')).toBe('2026-10-27T08:00:00.000Z');
    expect(toIsoDate('2026-10-27', '2026-10-27T15:30:00.000Z')).toBe('2026-10-27T15:30:00.000Z');
    expect(toIsoDate('2026-11-04', '2026-10-27T08:00:00.000Z')).toBe('2026-11-04T08:00:00.000Z');
    expect(toIsoDate('2026-11-04', undefined)).toBe('2026-11-04T08:00:00.000Z');
    expect(toIsoDate('', '2026-10-27T08:00:00.000Z')).toBeUndefined();
  });
});

describe('fileToBase64 / formatBytes (subida de PDF)', () => {
  it('codifica bytes a base64 sin prefijo data:', async () => {
    expect(await fileToBase64(new Blob([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])]))).toBe('JVBERi0=');
    expect(await fileToBase64(new Blob([new Uint8Array(70000).fill(0x41)]))).toBe(Buffer.alloc(70000, 'A').toString('base64'));
  });

  it('formatBytes legible', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(180 * 1024)).toBe('180 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
