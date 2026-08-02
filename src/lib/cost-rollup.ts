/**
 * El costo de una OT, con su procedencia a la vista.
 *
 * La auditoría de Analítica encontró cuatro tablas de costo que no coincidían
 * en 85 de 85 OTs. La causa no era que se contradijeran: era que la analítica
 * leía `ot_financials` (85 filas, sin escritor) mientras el ledger real tenía
 * apenas 36 líneas marcadas como reales. Migradas todas al ledger, queda un
 * problema nuevo y más sutil: ahora conviven en la misma tabla
 *
 *   · 600 líneas de ESTIMACIÓN del asistente
 *   ·  32 de costo real cargado a mano
 *   · 260 de una siembra de demo que suman $5.974 en total
 *
 * Sumarlas juntas da un número que no significa nada. Este módulo separa por
 * `kind` y por `source`, y —esto es lo importante— devuelve la PROCEDENCIA
 * junto al número, para que la pantalla pueda decir "este margen se apoya en 3
 * líneas reales y 12 estimadas" en vez de mostrar un peso y callarse.
 *
 * Puro y testeable, como el motor de costeo y el de abastecimiento.
 */

export type CostKind = 'estimate' | 'committed' | 'actual';
export type CostCategory = 'material' | 'labor' | 'machine' | 'finishing' | 'outsourced' | 'overhead' | 'other';

export interface CostLine {
  ot_id: string;
  kind: CostKind;
  category: CostCategory;
  total: number | null;
  source: string;
}

export interface OTRevenue {
  ot_id: string;
  ot_number: string | null;
  /** El texto que escribió el vendedor. */
  client_name: string | null;
  revenue: number | null;
  /** FK al maestro de clientes. */
  client_id?: string | null;
  /** Nombre según la FK. Si difiere de `client_name`, hay conflicto. */
  client_name_fk?: string | null;
}

/**
 * Cuando el texto y la FK nombran clientes distintos, la OT no se le atribuye a
 * ninguno de los dos. Repartir $330.000.000 entre dos clientes según cuál de
 * los dos campos le creemos es una decisión comercial, no técnica: se marca el
 * conflicto y se deja que una persona lo resuelva.
 */
export function hasClientConflict(r: OTRevenue): boolean {
  if (!r.client_id || !r.client_name || !r.client_name_fk) return false;
  return norm(r.client_name) !== norm(r.client_name_fk);
}

const norm = (s: string) => s.trim().toLowerCase();

/** De dónde salió cada peso. Sin esto un margen es una opinión. */
export interface Provenance {
  /** Líneas reales cargadas por una persona o por un proceso del taller. */
  realLines: number;
  /** Líneas migradas de la tabla vieja. */
  legacyLines: number;
  /** Líneas de la siembra de demostración. */
  seedLines: number;
  estimateLines: number;
  /** 0–100. Cuánto del costo real se apoya en líneas no sembradas. */
  confidence: number;
  /** Frase corta para mostrar bajo el número. */
  label: string;
}

export interface OTCostRollup {
  ot_id: string;
  ot_number: string | null;
  client_name: string | null;
  revenue: number;
  estimated_cost: number;
  actual_cost: number;
  committed_cost: number;
  by_category: Record<CostCategory, number>;
  gross_margin: number;
  margin_pct: number | null;
  provenance: Provenance;
  /** El margen no es utilizable para decidir precios. */
  unreliable: boolean;
}

/** Fuentes que NO representan trabajo real del taller. */
export const SYNTHETIC_SOURCES = new Set(['seed']);

const EMPTY_CATEGORIES = (): Record<CostCategory, number> => ({
  material: 0, labor: 0, machine: 0, finishing: 0, outsourced: 0, overhead: 0, other: 0,
});

export interface RollupOptions {
  /** Incluir las líneas sembradas. Por defecto NO: son ficción. */
  includeSeed?: boolean;
}

export function rollupCosts(
  lines: CostLine[],
  revenues: OTRevenue[],
  opts: RollupOptions = {}
): OTCostRollup[] {
  const { includeSeed = false } = opts;

  const byOt = new Map<string, CostLine[]>();
  for (const l of lines) {
    byOt.set(l.ot_id, [...(byOt.get(l.ot_id) ?? []), l]);
  }

  return revenues.map((r) => {
    const todas = byOt.get(r.ot_id) ?? [];
    // El conteo de procedencia mira TODAS las líneas, incluso las excluidas:
    // que una OT esté sembrada es justamente lo que hay que poder decir.
    const seedLines = todas.filter((l) => SYNTHETIC_SOURCES.has(l.source)).length;
    const usables = includeSeed ? todas : todas.filter((l) => !SYNTHETIC_SOURCES.has(l.source));

    const sum = (pred: (l: CostLine) => boolean) =>
      usables.filter(pred).reduce((a, l) => a + Number(l.total ?? 0), 0);

    const actual_cost = sum((l) => l.kind === 'actual');
    const estimated_cost = sum((l) => l.kind === 'estimate');
    const committed_cost = sum((l) => l.kind === 'committed');

    const by_category = EMPTY_CATEGORIES();
    for (const l of usables) {
      if (l.kind !== 'actual') continue;
      by_category[l.category] = (by_category[l.category] ?? 0) + Number(l.total ?? 0);
    }

    const revenue = Number(r.revenue ?? 0);
    const gross_margin = revenue - actual_cost;

    const realLines = usables.filter((l) => l.kind === 'actual' && l.source !== 'legacy').length;
    const legacyLines = usables.filter((l) => l.kind === 'actual' && l.source === 'legacy').length;
    const estimateLines = usables.filter((l) => l.kind === 'estimate').length;
    const actualTotal = realLines + legacyLines;

    const confidence = actualTotal === 0
      ? 0
      : Math.round((realLines / actualTotal) * 100);

    // Un margen es utilizable cuando hay ingreso y al menos una línea de costo
    // real. Sin costo real, "margen = ingreso" y eso es 100% de utilidad, que
    // es la mentira más cara que puede contar una app de imprenta.
    const unreliable = revenue <= 0 || actualTotal === 0 || seedLines > 0;

    return {
      ot_id: r.ot_id,
      ot_number: r.ot_number,
      client_name: r.client_name,
      revenue,
      estimated_cost,
      actual_cost,
      committed_cost,
      by_category,
      gross_margin,
      margin_pct: revenue > 0 ? Math.round((gross_margin / revenue) * 1000) / 10 : null,
      provenance: {
        realLines, legacyLines, seedLines, estimateLines, confidence,
        label: describeProvenance({ realLines, legacyLines, seedLines, estimateLines }),
      },
      unreliable,
    };
  });
}

function describeProvenance(p: Omit<Provenance, 'confidence' | 'label'>): string {
  if (p.seedLines > 0) {
    return 'Datos de demostración: este margen no describe un trabajo real.';
  }
  const actuales = p.realLines + p.legacyLines;
  if (actuales === 0) {
    return p.estimateLines > 0
      ? `Sin costo real cargado. Sólo hay ${p.estimateLines} línea(s) estimada(s) del presupuesto.`
      : 'Sin ninguna línea de costo. El margen mostrado sería el ingreso completo.';
  }
  const partes = [`${actuales} línea(s) de costo real`];
  if (p.legacyLines > 0) partes.push(`${p.legacyLines} migrada(s) del sistema anterior`);
  if (p.estimateLines > 0) partes.push(`${p.estimateLines} estimada(s) sin contrastar`);
  return partes.join(' · ');
}

export interface ClientRollup {
  client_id: string | null;
  client_name: string;
  ots: number;
  revenue: number;
  actual_cost: number;
  gross_margin: number;
  margin_pct: number | null;
  /** OTs del cliente que no tienen costo real: el margen no las incluye. */
  ots_sin_costo: number;
  reason: string;
}

/**
 * Rentabilidad por cliente — la pregunta por la que existe un módulo de
 * analítica: ¿cuál me deja plata y cuál me la quita?
 *
 * Las OT con conflicto entre el texto y la FK se agrupan aparte en vez de
 * asignarse a la brava a uno de los dos candidatos.
 */
export function rollupByClient(
  rows: OTCostRollup[],
  revenues: OTRevenue[]
): ClientRollup[] {
  const meta = new Map(revenues.map((r) => [r.ot_id, r]));
  const grupos = new Map<string, { name: string; id: string | null; rows: OTCostRollup[] }>();

  for (const r of rows) {
    const m = meta.get(r.ot_id);
    const conflicto = m ? hasClientConflict(m) : false;

    const key = conflicto
      ? '__conflicto__'
      : m?.client_id ?? `__texto__${norm(r.client_name ?? 'sin cliente')}`;

    const name = conflicto
      ? 'Cliente en conflicto (el texto y la ficha no coinciden)'
      : m?.client_name_fk ?? r.client_name ?? 'Sin cliente';

    const g = grupos.get(key) ?? { name, id: conflicto ? null : m?.client_id ?? null, rows: [] };
    g.rows.push(r);
    grupos.set(key, g);
  }

  return [...grupos.values()]
    .map((g) => {
      const confiables = g.rows.filter((r) => !r.unreliable);
      const revenue = confiables.reduce((a, r) => a + r.revenue, 0);
      const actual_cost = confiables.reduce((a, r) => a + r.actual_cost, 0);
      const sinCosto = g.rows.length - confiables.length;
      return {
        client_id: g.id,
        client_name: g.name,
        ots: g.rows.length,
        revenue,
        actual_cost,
        gross_margin: revenue - actual_cost,
        margin_pct: revenue > 0 ? Math.round(((revenue - actual_cost) / revenue) * 1000) / 10 : null,
        ots_sin_costo: sinCosto,
        reason:
          confiables.length === 0
            ? `Ninguna de las ${g.rows.length} OT de este cliente tiene costo real cargado.`
            : sinCosto > 0
              ? `Margen sobre ${confiables.length} de ${g.rows.length} OT; las otras ${sinCosto} no tienen costo real.`
              : `Margen sobre las ${confiables.length} OT del cliente.`,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/** Totales del período, con la misma honestidad que las filas. */
export function aggregateRollup(rows: OTCostRollup[]) {
  const confiables = rows.filter((r) => !r.unreliable);
  const sum = (list: OTCostRollup[], k: 'revenue' | 'actual_cost' | 'estimated_cost') =>
    list.reduce((a, r) => a + r[k], 0);

  const revenue = sum(confiables, 'revenue');
  const actual = sum(confiables, 'actual_cost');

  return {
    ots_total: rows.length,
    ots_confiables: confiables.length,
    ots_descartadas: rows.length - confiables.length,
    revenue,
    actual_cost: actual,
    estimated_cost: sum(confiables, 'estimated_cost'),
    gross_margin: revenue - actual,
    margin_pct: revenue > 0 ? Math.round(((revenue - actual) / revenue) * 1000) / 10 : null,
    // La cifra que la pantalla tiene que mostrar al lado del total.
    reason:
      rows.length === 0
        ? 'No hay OTs en el período.'
        : confiables.length === 0
          ? 'Ninguna OT del período tiene costo real cargado: no se puede calcular margen.'
          : `Calculado sobre ${confiables.length} de ${rows.length} OTs. Las otras ${rows.length - confiables.length} no tienen costo real cargado o son datos de demostración.`,
  };
}
