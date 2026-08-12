import { describe, expect, it, vi } from 'vitest';

import { fetchAll, truncationNote } from '../fetch-all';

/** Una tabla falsa que respeta el tope de 1.000 filas, como PostgREST. */
function tabla(total: number) {
	const filas = Array.from({ length: total }, (_, i) => ({ id: i }));
	const llamadas: [number, number][] = [];
	const build = async (desde: number, hasta: number) => {
		llamadas.push([desde, hasta]);
		return { data: filas.slice(desde, hasta + 1), error: null };
	};
	return { build, llamadas };
}

describe('traer todo, no las primeras mil', () => {
	it('la tabla que cabe en una página se pide una vez', async () => {
		const { build, llamadas } = tabla(240);
		const r = await fetchAll(build);
		expect(r.rows).toHaveLength(240);
		expect(r.truncated).toBe(false);
		expect(llamadas).toHaveLength(1);
	});

	it('el caso real: 4.256 líneas de costo llegan enteras', async () => {
		// Sin paginar llegaban 1.000, la pantalla mostraba 82% de margen en vez de
		// 22%, y decía «59 de 258 OT sin costo» — que sonaba a dato faltante y era
		// una consulta cortada.
		const { build, llamadas } = tabla(4_256);
		const r = await fetchAll(build);
		expect(r.rows).toHaveLength(4_256);
		expect(r.truncated).toBe(false);
		expect(llamadas).toHaveLength(5);
	});

	it('una tabla que es múltiplo exacto del tamaño de página no pierde nada', async () => {
		// El caso que un `while (lote.length === pageSize)` mal escrito rompe: la
		// última página llena obliga a una más, que viene vacía.
		const { build } = tabla(2_000);
		const r = await fetchAll(build);
		expect(r.rows).toHaveLength(2_000);
		expect(r.truncated).toBe(false);
	});

	it('tabla vacía devuelve vacío sin marcar truncado', async () => {
		const { build } = tabla(0);
		const r = await fetchAll(build);
		expect(r.rows).toEqual([]);
		expect(r.truncated).toBe(false);
	});
});

describe('cuando no alcanza, lo dice', () => {
	it('al llegar al techo marca truncado en vez de callarse', async () => {
		// Es la razón de existir del archivo. Devolver mil filas sin avisar es lo
		// que hacía PostgREST y lo que produjo un margen de 82%.
		const { build } = tabla(5_000);
		const r = await fetchAll(build, { max: 2_000 });
		expect(r.rows).toHaveLength(2_000);
		expect(r.truncated).toBe(true);
	});

	it('el aviso dice que los totales quedan POR DEBAJO de lo real', async () => {
		const { build } = tabla(5_000);
		const r = await fetchAll(build, { max: 2_000 });
		const nota = truncationNote(r, 'líneas de costo')!;
		expect(nota).toContain('2.000');
		expect(nota).toContain('por debajo');
	});

	it('sin truncar no hay aviso', async () => {
		const { build } = tabla(100);
		expect(truncationNote(await fetchAll(build), 'líneas')).toBeNull();
	});
});

describe('los errores no se disimulan', () => {
	it('un error en la segunda página no devuelve la primera como si fuera todo', async () => {
		// Devolver lo que alcanzó a llegar sería el mismo problema con otro
		// disfraz: datos parciales que se ven completos.
		let n = 0;
		const build = vi.fn(async (desde: number, hasta: number) => {
			n += 1;
			if (n === 2) return { data: null, error: { message: 'se cayó la conexión' } };
			return { data: Array.from({ length: hasta - desde + 1 }, (_, i) => ({ id: desde + i })), error: null };
		});
		await expect(fetchAll(build)).rejects.toThrow('se cayó la conexión');
	});
});

describe('el tamaño de página no supera lo que PostgREST entrega', () => {
	it('pedir páginas de 5.000 se acota a 1.000', async () => {
		const { build, llamadas } = tabla(2_500);
		await fetchAll(build, { pageSize: 5_000 });
		expect(llamadas[0]).toEqual([0, 999]);
	});
});
