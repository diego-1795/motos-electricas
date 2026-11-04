import { describe, expect, it } from 'vitest';
import { normalizeYouTubeUrl, youtubeId } from '../../src/domain/video';

/** Normalización del campo videoUrl del editor de producto (ADR-023). */
describe('youtubeId / normalizeYouTubeUrl', () => {
  const ID = 'dQw4w9WgXcQ';
  const canonical = `https://www.youtube.com/watch?v=${ID}`;

  it('acepta watch?v=, youtu.be, shorts, embed, live, móvil y sin protocolo; descarta parámetros de seguimiento', () => {
    for (const u of [
      canonical,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}&t=30s`,
      `https://www.youtube.com/watch?feature=share&v=${ID}&list=PLx`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}?autoplay=1`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `youtube.com/watch?v=${ID}`,
      `  https://youtu.be/${ID}  `,
    ]) {
      expect(youtubeId(u), u).toBe(ID);
      expect(normalizeYouTubeUrl(u), u).toBe(canonical);
    }
  });

  it('rechaza lo que no es un vídeo de YouTube', () => {
    for (const u of ['', '   ', 'https://vimeo.com/123', 'https://www.youtube.com/', 'https://www.youtube.com/channel/UCxyz', `https://www.youtube.com/watch?v=corto`, `https://notyoutube.com/watch?v=${ID}`, `https://youtube.com.evil.test/watch?v=${ID}`, 'javascript:alert(1)', `https://www.youtube.com/watch?v=${ID}<script>`]) {
      expect(youtubeId(u), u).toBeNull();
      expect(normalizeYouTubeUrl(u), u).toBeNull();
    }
  });

  it('la URL normalizada la entiende el extractor de ProductTabs.astro (mismo patrón v=)', () => {
    const tabsRe = /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/;
    expect(tabsRe.exec(normalizeYouTubeUrl(`https://youtu.be/${ID}`)!)?.[1]).toBe(ID);
  });
});
