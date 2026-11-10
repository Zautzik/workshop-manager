/**
 * La tarjeta de tarifas del servidor — los mismos insumos con que se cotiza.
 *
 * Quien cotiza (el asistente de OT, en el navegador) resuelve sus tarifas con
 * `resolveCostOverrides` sobre el catálogo (`/api/cost-catalog`) y el costo
 * real ponderado de los materiales (`/api/inventory/material-cost`). Del lado
 * del servidor, la inferencia de WhatsApp tenía su propia tabla —el papel a
 * $1.500 el kilo cuando el adhesivo de la OT 41221 cuesta $3.500— y el
 * presupuesto otra (auditoría 2026-11-05, C-1).
 *
 * Esto le da al servidor exactamente esos dos insumos, para que resuelva con la
 * misma función. Cambiar una tarifa en el catálogo la cambia para la
 * cotización, para el parte del taller y para el tiempo de máquina a la vez.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveCostOverrides, type CostSpec } from '@/lib/costing-resolver';
import { DEFAULT_COSTS, type CostOverrides } from '@/lib/ot-calculations';
import type { CostCenterItem } from '@/types/work-category';
import type { MaterialCost } from '@/hooks/use-cost-catalog';

export interface RateInputs {
	catalog: CostCenterItem[];
	materialCost: MaterialCost[];
}

export async function loadRateInputs(): Promise<RateInputs> {
	const [catalog, material] = await Promise.all([
		supabaseAdmin.from('cost_catalog').select('id, catalog_key, name, category, unit, unit_cost, is_active'),
		supabaseAdmin.from('material_cost_v').select('*'),
	]);
	if (catalog.error) throw new Error(`No se pudo leer el catálogo de costos: ${catalog.error.message}`);
	// Sin costo real de materiales el resolvedor cae al catálogo, igual que en
	// el navegador cuando la vista no responde: no es motivo para no tarifar.
	return {
		catalog: (catalog.data ?? []) as unknown as CostCenterItem[],
		materialCost: (material.error ? [] : (material.data ?? [])) as unknown as MaterialCost[],
	};
}

/** Las tarifas de una OT: lo que resuelve el catálogo, y el defecto del motor para lo que no. */
export function ratesFor(spec: CostSpec, inputs: RateInputs): Required<CostOverrides> {
	return { ...DEFAULT_COSTS, ...resolveCostOverrides(inputs.catalog, spec, inputs.materialCost) } as Required<CostOverrides>;
}

export type { CostSpec };
