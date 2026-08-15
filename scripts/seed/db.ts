/**
 * El acceso a la base para el sembrador.
 *
 * Habla PostgREST con la llave de servicio, que es la única forma de escribir
 * saltándose RLS — y por eso este archivo no se importa nunca desde `src/`.
 */

import fs from 'node:fs';
import path from 'node:path';

const raíz = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function leerEnv(): Record<string, string> {
	const archivo = path.join(raíz, '.env.local');
	const texto = fs.readFileSync(archivo, 'utf8');
	return Object.fromEntries(
		texto
			.split('\n')
			.filter((l) => l.includes('=') && !l.trim().startsWith('#'))
			.map((l) => {
				const i = l.indexOf('=');
				return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
			}),
	);
}

const env = leerEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !LLAVE) {
	throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}

const cabeceras = {
	apikey: LLAVE,
	Authorization: `Bearer ${LLAVE}`,
	'Content-Type': 'application/json',
};

/**
 * Llamar una función de la base.
 *
 * Vive acá y no en cada script por la misma razón que el resto: una sola puerta
 * a la base. Un script que arma su propia URL termina leyendo otro `.env`.
 */
export async function llamar<T = unknown>(nombre: string, args: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${URL_BASE}/rest/v1/rpc/${nombre}`, {
		method: 'POST',
		headers: cabeceras,
		body: JSON.stringify(args),
	});
	if (!res.ok) throw new Error(`${nombre}: ${await res.text()}`);
	return res.json().catch(() => null as T);
}

/** Cuántas filas por request. PostgREST aguanta más, pero así los errores se ubican. */
const LOTE = 400;

export async function contar(tabla: string): Promise<number> {
	const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=id`, {
		headers: { ...cabeceras, Prefer: 'count=exact', Range: '0-0' },
	});
	const rango = res.headers.get('content-range') ?? '*/0';
	return Number(rango.split('/')[1] ?? 0);
}

export async function leer<T = any>(consulta: string): Promise<T[]> {
	const res = await fetch(`${URL_BASE}/rest/v1/${consulta}`, { headers: cabeceras });
	if (!res.ok) throw new Error(`GET ${consulta} → ${res.status} ${await res.text()}`);
	return res.json();
}

/**
 * PostgREST exige que TODOS los objetos de un lote tengan las mismas claves.
 *
 * Si una fila lleva `notes` y la siguiente no, rechaza el lote entero con
 * `PGRST102: All object keys must match`. No es una validación de datos —es una
 * restricción del protocolo, porque arma un solo INSERT con una lista de
 * columnas fija.
 *
 * Se normaliza acá y no en cada llamada porque el error aparece cada vez que
 * alguien agrega un campo condicional a una fila, que es lo más natural del
 * mundo. Un solo arreglo, en la única puerta por la que pasan todos los inserts.
 *
 * CUIDADO: rellenar con `null` no es lo mismo que omitir. Una columna con
 * DEFAULT recibe el default sólo si la clave no viaja; si viaja como `null`,
 * recibe `null`. Por eso un lote donde algunas filas quieren el default y otras
 * no, no se puede mezclar — hay que partirlo en dos llamadas.
 */
export function mismaForma(filas: Record<string, unknown>[]): Record<string, unknown>[] {
	if (filas.length < 2) return filas;

	const claves = new Set<string>();
	for (const f of filas) for (const k of Object.keys(f)) claves.add(k);

	// Si ya son todas iguales, no se toca nada.
	if (filas.every((f) => Object.keys(f).length === claves.size)) return filas;

	return filas.map((f) => {
		const salida: Record<string, unknown> = {};
		for (const k of claves) salida[k] = k in f ? f[k] : null;
		return salida;
	});
}

/**
 * Inserta por lotes y devuelve las filas creadas.
 *
 * Un error no se traga: si una fila no entra, la siembra se detiene ahí. Media
 * base sembrada es peor que ninguna, porque parece completa.
 */
export async function insertar<T = any>(
	tabla: string,
	filas: Record<string, unknown>[],
	opciones: { devolver?: boolean; conflicto?: string } = {},
): Promise<T[]> {
	if (filas.length === 0) return [];
	const salida: T[] = [];

	const normalizadas = mismaForma(filas);

	for (let i = 0; i < normalizadas.length; i += LOTE) {
		const trozo = normalizadas.slice(i, i + LOTE);
		const prefer = [
			opciones.devolver ? 'return=representation' : 'return=minimal',
			opciones.conflicto ? 'resolution=merge-duplicates' : null,
		].filter(Boolean).join(',');

		const url = `${URL_BASE}/rest/v1/${tabla}${opciones.conflicto ? `?on_conflict=${opciones.conflicto}` : ''}`;
		const res = await fetch(url, { method: 'POST', headers: { ...cabeceras, Prefer: prefer }, body: JSON.stringify(trozo) });

		if (!res.ok) {
			const cuerpo = await res.text();
			throw new Error(
				`INSERT ${tabla} (filas ${i}–${i + trozo.length}) → ${res.status}\n${cuerpo}\n` +
				`Primera fila del lote:\n${JSON.stringify(trozo[0], null, 2)}`,
			);
		}
		if (opciones.devolver) salida.push(...((await res.json()) as T[]));
	}
	return salida;
}

export async function actualizar(tabla: string, filtro: string, campos: Record<string, unknown>): Promise<void> {
	const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?${filtro}`, {
		method: 'PATCH',
		headers: { ...cabeceras, Prefer: 'return=minimal' },
		body: JSON.stringify(campos),
	});
	if (!res.ok) throw new Error(`PATCH ${tabla}?${filtro} → ${res.status} ${await res.text()}`);
}

export async function borrar(tabla: string, filtro: string): Promise<void> {
	const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?${filtro}`, {
		method: 'DELETE',
		headers: { ...cabeceras, Prefer: 'return=minimal' },
	});
	if (!res.ok) throw new Error(`DELETE ${tabla}?${filtro} → ${res.status} ${await res.text()}`);
}

/** UUID v4 determinista no: acá se usa el del runtime, que basta. */
export const uuid = () => crypto.randomUUID();
