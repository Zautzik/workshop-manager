/**
 * La taxonomía que el taller usa de verdad — coincide con `employees.department`.
 *
 * Antes existía una copia en un desplegable con valores en inglés
 * (`press`, `manual_workshop`, `pre_press`...) que nunca coincidió con lo que
 * de verdad se guarda ahí. El filtro por departamento en Rendimiento
 * comparaba esos valores contra el texto libre real y volvía vacío para todo
 * menos "Todos" (2026-08 audit) — el mismo defecto de raíz que ya se había
 * corregido una vez en el formulario de alta de personas.
 */
export const DEPARTMENTS = [
  'Impresión Offset',
  'Pre-Prensa',
  'Terminaciones',
  'Corte',
  'Troquelado',
  'Despacho',
  'Bodega',
  'Management',
] as const;

export type Department = (typeof DEPARTMENTS)[number];
