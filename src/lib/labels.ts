import type { BlogPost, PartKind } from '../domain/types';

/** Etiquetas de presentación (español de Perú) compartidas por varias páginas. */

export const partKindLabel: Record<PartKind, string> = {
  bateria: 'Baterías',
  motor: 'Motores',
  controlador: 'Controladores',
  cargador: 'Cargadores',
  iluminacion: 'Iluminación',
  frenos: 'Frenos',
  cables: 'Cables',
  mandos: 'Mandos y manijas',
  seguridad: 'Seguridad',
  llantas: 'Llantas',
  otro: 'Otros',
};

/** Singular para la ficha de un repuesto */
export const partKindSingular: Record<PartKind, string> = {
  bateria: 'Batería',
  motor: 'Motor',
  controlador: 'Controlador',
  cargador: 'Cargador',
  iluminacion: 'Iluminación',
  frenos: 'Frenos',
  cables: 'Cable',
  mandos: 'Mando',
  seguridad: 'Seguridad',
  llantas: 'Llanta',
  otro: 'Repuesto',
};

export const blogCategoryLabel: Record<BlogPost['category'], string> = {
  guias: 'Guías',
  comparativas: 'Comparativas',
  autonomia: 'Autonomía',
  baterias: 'Baterías',
  mantenimiento: 'Mantenimiento',
  legislacion: 'Legislación',
  movilidad: 'Movilidad eléctrica',
  compra: 'Consejos de compra',
};
