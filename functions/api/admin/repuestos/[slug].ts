import { entryRoutes } from '../_lib/routes';

/**
 * PATCH  /api/admin/repuestos/:slug  PartPatch     (admin y editor)
 * PUT    /api/admin/repuestos/:slug  PutBody<Part> (solo admin; sin sha = crear)
 * DELETE /api/admin/repuestos/:slug  DeleteBody    (solo admin; 409 si un producto lo lista en accessories)
 */
export const { onRequestPatch, onRequestPut, onRequestDelete } = entryRoutes('repuestos');
