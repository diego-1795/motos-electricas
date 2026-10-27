import { entryRoutes } from '../_lib/routes';

/**
 * PATCH  /api/admin/products/:slug  ProductPatch     (admin y editor)
 * PUT    /api/admin/products/:slug  PutBody<Product> (solo admin; sin sha = crear)
 * DELETE /api/admin/products/:slug  DeleteBody       (solo admin; 409 si otra ficha lo referencia)
 */
export const { onRequestPatch, onRequestPut, onRequestDelete } = entryRoutes('products');
