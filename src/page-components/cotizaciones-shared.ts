import { computeOTCalculations, computeImposition, generateDefaultOperations } from '@/lib/ot-calculations';
import { resolveCostOverrides } from '@/lib/costing-resolver';
import type { OTFormData } from '@/types/ot';
import type { CostCenterItem } from '@/types/work-category';

export const INK_COVERAGE = { light: 0.5, medium: 1, heavy: 2 } as const;
export type Coverage = keyof typeof INK_COVERAGE;

export interface EstimateLine { category: string; description: string; quantity: number; unit: string; unit_cost: number; }

/** Las terminaciones que el taller ofrece, con el nombre que usa el vendedor. */
export const TERMINACIONES = [
  { key: 'finish_troquelado', label: 'Troquelado' },
  { key: 'finish_plegado', label: 'Plegado' },
  { key: 'finish_pegado', label: 'Pegado' },
  { key: 'finish_laminado', label: 'Laminado' },
  { key: 'finish_barniz', label: 'Barniz' },
  { key: 'finish_relieve', label: 'Relieve' },
  { key: 'finish_perforado', label: 'Perforado' },
  { key: 'finish_hot_stamping', label: 'Hot stamping' },
  { key: 'finish_uv_localizado', label: 'UV localizado' },
  { key: 'finish_numeracion', label: 'Numeración' },
] as const;

/** Los productos que el taller sabe hacer. Antes toda cotización nacía «etiqueta». */
export const TIPOS_PRODUCTO = [
  { key: 'etiqueta', label: 'Etiqueta' },
  { key: 'caja_plegadiza', label: 'Caja plegadiza' },
  { key: 'caja_display', label: 'Caja display' },
  { key: 'volante', label: 'Volante' },
  { key: 'afiche', label: 'Afiche' },
  { key: 'brochure', label: 'Folleto' },
  { key: 'carpeta', label: 'Carpeta' },
  { key: 'sobre', label: 'Sobre' },
  { key: 'bolsa', label: 'Bolsa' },
  { key: 'otro', label: 'Otro' },
] as const;

export const COLOR_MODE_BY_COUNT: Record<number, string> = {
  0: 'sin_impresion', 1: '1_color', 2: '2_color', 3: '3_color', 4: 'cmyk', 5: 'cmyk_pantone',
};

/**
 * El presupuesto del vendedor usa EL MISMO motor que producción.
 *
 * Antes esta pantalla tenía su propia fórmula: un pliego 72×102 fijo, 50
 * pliegos de alistamiento planos, 2% de merma y tarifas escritas a mano
 * (papel 1.800/kg, prensa 25.000/h). El motor v2 —el calibrado, el que corre
 * el taller— modela cuatro formatos reales con pinza y sangrado, pasadas
 * reales (4/0 en una prensa de 4 cuerpos es UNA pasada, no cuatro),
 * alistamiento por pasada y tarifas del catálogo.
 *
 * O sea: el vendedor cotizaba con una matemática distinta a la que después
 * factura el taller. Dos verdades de costo, la misma clase de problema que
 * este proyecto lleva meses cerrando. Ahora hay una sola — y cuando Guillermo
 * calibre §6.6, las cotizaciones mejoran solas.
 */
export interface PressRef {
  id: string;
  name: string;
  /** `offset_printer` u `digital_printer`: cambian de economía, no sólo de nombre. */
  type: string;
  bodies: number;
  speedSheetsHr: number;
  maxWidthCm: number;
  maxHeightCm: number;
}

export function buildEstimate(
  s: {
    quantity: number; width_cm: number; height_cm: number; grammage_gsm: number;
    colors_front: number; colors_back: number; substrate_type: string;
    finishes: Record<string, boolean>;
    variable_data: boolean;
    die_new: boolean;
    coverage: Coverage;
  },
  catalog: CostCenterItem[],
  materialCost: any[],
  press: PressRef | null
) {
  const calcInput = {
    quantity: s.quantity,
    width_cm: s.width_cm,
    height_cm: s.height_cm,
    grammage_gsm: s.grammage_gsm,
    substrate_type: s.substrate_type,
    color_front: COLOR_MODE_BY_COUNT[s.colors_front] ?? 'cmyk',
    color_back: COLOR_MODE_BY_COUNT[s.colors_back] ?? 'sin_impresion',
    finishes: s.finishes,
    variable_data: s.variable_data,
    die_new: s.die_new,
  } as unknown as OTFormData;

  // La cobertura del arte multiplica el consumo de tinta: un fondo sólido a
  // full come mucho más que una línea fina, y es el caso que se cotiza barato
  // y se imprime caro.
  // La prensa decide qué pliego se puede montar, y el pliego decide todo lo
  // demás: poses, cantidad de pliegos, kilos de papel y horas de máquina.
  //
  // Sin este límite el motor elegía el pliego que mejor aprovecha el papel —un
  // 77×110— que ninguna de las dos Ryobi del taller puede agarrar: su área
  // máxima es 37×52. Medido sobre 100.000 etiquetas de 9×12, la diferencia era
  // 1.667 pliegos contra 10.320, y un costo de $723.564 contra $1.056.750. El
  // vendedor cotizaba $976.811 y vendía a pérdida creyendo que ganaba 26%.
  const limit = press ? { maxWidthCm: press.maxWidthCm, maxHeightCm: press.maxHeightCm } : null;
  const impo = computeImposition(s.width_cm, s.height_cm, s.quantity, limit);
  // La imposición viaja DENTRO del formulario: `generateDefaultOperations` la
  // necesita para cobrar el corte previo de resma cuando el pliego de prensa
  // sale de partir uno de compra. Sin ella esa operación no se cotizaba.
  (calcInput as any).imposition = impo;
  const calcs = computeOTCalculations(calcInput, {
    inkCoverage: s.coverage,
    variableData: s.variable_data,
    digitalSpeedSheetsHr: press?.type === 'digital_printer' ? press.speedSheetsHr : undefined,
    pressLimit: limit,
    machineSpeedSheetsHr: press?.speedSheetsHr,
    pressBodies: press?.bodies,
  });
  const overrides = resolveCostOverrides(
    catalog,
    {
      color_front: calcInput.color_front,
      color_back: calcInput.color_back,
      substrate_type: s.substrate_type,
      grammage_gsm: s.grammage_gsm,
    },
    materialCost
  );

  const ops = generateDefaultOperations(calcInput, calcs, overrides);
  const lines: EstimateLine[] = ops.map((o) => ({
    category: o.category,
    description: o.name,
    quantity: o.quantity,
    unit: o.unit,
    unit_cost: o.unit_cost,
  }));

  const subtotal = Math.round(lines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0));
  return { lines, subtotal, calcs, impo };
}
