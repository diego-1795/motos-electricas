/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

/**
 * Usa la config de Vite de Astro para que `import.meta.env`, `astro:content`
 * y los alias del proyecto resuelvan igual que en build.
 * El tipo de `getViteConfig` no incluye la clave `test` de Vitest; la referencia
 * de tipos de arriba la añade mediante module augmentation.
 */
export default getViteConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // Sincroniza las colecciones en .astro/ antes de los tests (ver tests/setup/astro-content.ts).
    globalSetup: ['tests/setup/astro-content.ts'],
    environment: 'node',
    env: {
      PUBLIC_SITE_URL: 'https://raiden.test',
      PUBLIC_WHATSAPP_NUMBER: '51987654321',
    },
  },
});
