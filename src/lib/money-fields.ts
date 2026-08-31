import type { AppRole } from '@/types/app-role';

/**
 * Quién puede ver plata.
 *
 * La app entera lee con `supabaseAdmin` (rol de servicio, ver
 * `src/integrations/supabase/server.ts`) — RLS y los GRANT por columna de
 * Postgres nunca se aplican a una petición real, sólo protegen un acceso
 * directo a la base. La autorización real vive acá: en el código de cada
 * ruta, decidiendo qué campos devuelve según el rol de sesión.
 *
 * `technician` es el rol que faltaba filtrar. `GET /api/ots` no restringe
 * rol (cualquiera con sesión puede listar OTs para el Kanban) y hacía
 * `select('*')`, así que un técnico veía precio, margen y comisión de cada
 * trabajo en la respuesta JSON — invisible en la UI, pero ahí en la pestaña
 * Network para quien mirara. Lo mismo en costos reales, operaciones y el
 * análisis de costos: cuatro rutas, la misma fuga.
 */
const MONEY_VISIBLE_ROLES: ReadonlySet<AppRole> = new Set(['admin', 'manager', 'supervisor', 'vendedor']);

export function canSeeMoney(role: AppRole | null | undefined): boolean {
	return !!role && MONEY_VISIBLE_ROLES.has(role);
}

/** Lo que cuesta y lo que se cobra por una OT. */
export const OT_MONEY_FIELDS = [
	'subtotal', 'margin_pct', 'margin_amount', 'increment_pct', 'increment_amount',
	'commission_pct', 'commission_amount', 'total_price', 'unit_price',
] as const;

/** Lo mismo, para una línea de operación u costo real (`ot_operations`,
 *  `ot_real_costs`): cuánto cuesta esa línea puntual. */
export const OPERATION_MONEY_FIELDS = ['unit_cost', 'total_cost'] as const;

/**
 * Devuelve la fila (o el arreglo de filas) con los campos de plata anulados
 * si el rol no debe verlos. Anula en vez de borrar la clave: el consumidor
 * (frontend o tipo) sigue viendo la forma esperada, sólo que sin el valor.
 */
export function redactMoney<T extends Record<string, unknown>>(
	rows: T,
	role: AppRole | null | undefined,
	fields?: readonly string[],
): T;
export function redactMoney<T extends Record<string, unknown>>(
	rows: T[],
	role: AppRole | null | undefined,
	fields?: readonly string[],
): T[];
export function redactMoney<T extends Record<string, unknown>>(
	rows: T | T[],
	role: AppRole | null | undefined,
	fields: readonly string[] = OT_MONEY_FIELDS,
): T | T[] {
	if (canSeeMoney(role)) return rows;

	const strip = (row: T): T => {
		const copy: Record<string, unknown> = { ...row };
		for (const f of fields) {
			if (f in copy) copy[f] = null;
		}
		return copy as T;
	};

	return Array.isArray(rows) ? rows.map(strip) : strip(rows);
}
