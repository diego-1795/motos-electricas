import { execFileSync } from 'node:child_process';

/**
 * globalSetup de Vitest: deja listo el data store de las colecciones (`astro:content`).
 *
 * Vitest carga el config de Vite de Astro en modo "serve" (= dev), así que el módulo virtual
 * `astro:content` lee `.astro/data-store.json`, un fichero que solo escribe `astro dev`.
 * En un checkout limpio (CI, worktree nuevo) no existe y `getCollection()` devuelve `[]`,
 * con lo que `content.test.ts` fallaba aunque el catálogo estuviera bien.
 * `astro sync` / `astro build` escriben el store en `cacheDir` (node_modules/.astro), no aquí;
 * por eso sincronizamos con `cacheDir` apuntando a `.astro/`, como hace el servidor de desarrollo.
 *
 * Se ejecuta en un proceso hijo: dentro del proceso de Vitest el paquete `astro` se resuelve a
 * través del config de Vite de Astro y la API programática (`sync`) no está disponible.
 */
const SYNC_SCRIPT = `import { sync } from 'astro'; await sync({ cacheDir: './.astro/', logLevel: 'error' });`;

export default function setup(): void {
  execFileSync(process.execPath, ['--input-type=module', '-e', SYNC_SCRIPT], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
}
