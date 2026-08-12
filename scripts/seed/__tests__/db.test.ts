import { describe, expect, it, vi } from 'vitest';

// `db.ts` lee .env.local al importarse. Se sustituye el sistema de archivos
// para poder probar la lógica sin depender de que exista el archivo.
vi.mock('node:fs', () => ({
	default: { readFileSync: () => 'NEXT_PUBLIC_SUPABASE_URL=http://x\nSUPABASE_SERVICE_ROLE_KEY=y\n' },
	readFileSync: () => 'NEXT_PUBLIC_SUPABASE_URL=http://x\nSUPABASE_SERVICE_ROLE_KEY=y\n',
}));

const { mismaForma } = await import('../db');

/**
 * PostgREST arma UN solo INSERT con una lista de columnas fija, así que rechaza
 * el lote entero —`PGRST102: All object keys must match`— si un objeto trae una
 * clave que otro no. Aparece cada vez que alguien agrega un campo condicional a
 * una fila, que es lo más natural del mundo.
 */
describe('todas las filas de un lote con la misma forma', () => {
	it('rellena la clave que le falta a una fila', () => {
		const salida = mismaForma([
			{ a: 1, b: 2 },
			{ a: 3 },
		]);
		expect(salida).toEqual([
			{ a: 1, b: 2 },
			{ a: 3, b: null },
		]);
	});

	it('el caso real: líneas de costo con y sin nota', () => {
		const salida = mismaForma([
			{ ot_id: 'x', kind: 'estimate', description: 'Sustrato/Papel' },
			{ ot_id: 'x', kind: 'actual', description: 'Papel consumido', notes: 'Merma sobre lo planificado' },
		]);
		expect(Object.keys(salida[0]).sort()).toEqual(Object.keys(salida[1]).sort());
		expect(salida[0].notes).toBeNull();
		expect(salida[1].notes).toBe('Merma sobre lo planificado');
	});

	it('une claves de tres formas distintas', () => {
		const salida = mismaForma([{ a: 1 }, { b: 2 }, { c: 3 }]);
		for (const fila of salida) expect(Object.keys(fila).sort()).toEqual(['a', 'b', 'c']);
		expect(salida[0]).toEqual({ a: 1, b: null, c: null });
	});

	it('no toca un lote que ya viene parejo', () => {
		// Importa: rellenar con `null` NO es lo mismo que omitir. Una columna con
		// DEFAULT lo recibe sólo si la clave no viaja; si viaja como null, recibe
		// null. Un lote parejo tiene que salir idéntico.
		const filas = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
		expect(mismaForma(filas)).toBe(filas);
	});

	it('conserva los valores nulos que ya venían', () => {
		const salida = mismaForma([{ a: 1, b: null }, { a: 2 }]);
		expect(salida[0].b).toBeNull();
		expect(salida[1].b).toBeNull();
	});

	it('una fila sola y una lista vacía pasan sin tocarse', () => {
		const una = [{ a: 1 }];
		expect(mismaForma(una)).toBe(una);
		expect(mismaForma([])).toEqual([]);
	});

	it('un valor `undefined` explícito cuenta como clave presente', () => {
		// `JSON.stringify` borra las claves con undefined, así que la fila viajaría
		// corta igual. Se normaliza a null, que sí viaja.
		const salida = mismaForma([{ a: 1, b: undefined }, { a: 2, b: 5 }]);
		expect(salida[0]).toHaveProperty('b');
	});
});
