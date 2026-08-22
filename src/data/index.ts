import { jsonRepositories } from './json';
import type { Repositories } from './repositories';

/** Punto único de inyección de repositorios. Cambiar aquí para migrar a Supabase. */
export const repos: Repositories = jsonRepositories;
export type { Repositories } from './repositories';
