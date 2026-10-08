export const VALID_TABS = ['items', 'lots', 'transactions', 'calculator', 'movement-types'] as const;
export type InventoryTab = (typeof VALID_TABS)[number];

export const CATEGORY_OPTIONS = [
  { value: 'tool', label: 'Herramientas' },
  { value: 'supply', label: 'Insumos' },
  { value: 'product_input', label: 'Materias primas' },
  { value: 'spare_part', label: 'Repuestos' },
];

// `category` distingue durable de consumible; esto distingue papel de tinta
// de envase — la pregunta que category no contesta, porque papel y tinta son
// los dos 'product_input'. Mismo vocabulario que ot_requirements.kind en
// Compras (auditoría 2026-08).
export const MATERIAL_KIND_OPTIONS = [
  { value: 'papel', label: 'Papel' },
  { value: 'tinta_especial', label: 'Tinta especial' },
  { value: 'envase', label: 'Envase y embalaje' },
  { value: 'servicio', label: 'Servicio externo' },
  { value: 'insumo', label: 'Insumo' },
  { value: 'herramental', label: 'Herramental' },
  { value: 'otro', label: 'Otro' },
];

// Red de seguridad mientras carga (o si falla) useMovementTypes() — la
// fuente real es la tabla movement_types, editable en la pestaña "Tipos de
// movimiento" sin tocar código. Ver src/hooks/use-movement-types.ts.
export const FALLBACK_TX_OPTIONS = [
  { value: 'purchase', label: 'Compra (+)' },
  { value: 'consumption', label: 'Consumo (-)' },
  { value: 'adjustment_in', label: 'Ajuste a favor (+)' },
  { value: 'adjustment_out', label: 'Ajuste en contra (-)' },
  { value: 'return_to_stock', label: 'Devolución a bodega (+)' },
];
export const FALLBACK_TX_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FALLBACK_TX_OPTIONS.map((o) => [o.value, o.label]),
);

export const getCategoryLabel = (value?: string | null) => {
  const found = CATEGORY_OPTIONS.find((option) => option.value === value);
  return found?.label || value || '-';
};

export const getMaterialKindLabel = (value?: string | null) => {
  const found = MATERIAL_KIND_OPTIONS.find((option) => option.value === value);
  return found?.label || (value ? value : 'Sin clasificar');
};

// Colores por familia, deliberadamente lejos de rojo/ámbar/verde — esos tres
// ya significan algo (agotado/bajo/disponible) y una familia con el mismo
// tono se leería como una alarma de stock que no es.
const FAMILY_STYLES: Record<string, { chip: string; dot: string; bar: string; border: string }> = {
  papel: { chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', bar: 'bg-sky-500', border: 'border-l-sky-500' },
  tinta_especial: { chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', bar: 'bg-violet-500', border: 'border-l-violet-500' },
  envase: { chip: 'bg-teal-500/15 text-teal-700 dark:text-teal-300', dot: 'bg-teal-500', bar: 'bg-teal-500', border: 'border-l-teal-500' },
  servicio: { chip: 'bg-slate-500/15 text-slate-700 dark:text-slate-300', dot: 'bg-slate-500', bar: 'bg-slate-500', border: 'border-l-slate-500' },
  insumo: { chip: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300', dot: 'bg-fuchsia-500', bar: 'bg-fuchsia-500', border: 'border-l-fuchsia-500' },
  herramental: { chip: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500', bar: 'bg-indigo-500', border: 'border-l-indigo-500' },
  otro: { chip: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300', dot: 'bg-zinc-500', bar: 'bg-zinc-500', border: 'border-l-zinc-500' },
};
export const familyStyle = (kind?: string | null) => FAMILY_STYLES[String(kind)] ?? FAMILY_STYLES.otro;

export const STOCK_ORDER: Record<string, number> = { nunca: 0, agotado: 0, bajo: 1, ok: 2 };
