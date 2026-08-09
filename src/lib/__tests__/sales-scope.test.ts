import { describe, expect, it, vi } from 'vitest';

/**
 * El perímetro comercial: qué filas ve y qué filas puede tocar un vendedor.
 *
 * Este archivo estaba sin pruebas, y es el que decide si un vendedor ve la
 * cartera de otro. Las dos fallas que importan tienen la misma forma —«no se
 * pudo resolver a quién pertenece, así que muestro todo»— y las dos son
 * silenciosas: nadie reporta que vio de más.
 *
 * `resolveSalesScope` consulta la base, así que el cliente admin se sustituye.
 * Lo que se prueba es la DECISIÓN, no Supabase.
 */

const maybeSingle = vi.fn();

vi.mock('@/integrations/supabase/server', () => ({
	supabaseAdmin: {
		from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
	},
}));

const { canActOnSalesRow, resolveSalesScope, scopeFilterId } = await import('../sales-scope');

const NADA = '00000000-0000-0000-0000-000000000000';

describe('quién ve toda la cartera', () => {
	it('admin, manager y supervisor ven todo sin consultar la base', async () => {
		for (const role of ['admin', 'manager', 'supervisor'] as const) {
			maybeSingle.mockClear();
			const scope = await resolveSalesScope({ id: 'u1', role });
			expect(scope.all).toBe(true);
			// Ni siquiera busca el empleado: el rol ya decide.
			expect(maybeSingle).not.toHaveBeenCalled();
		}
	});

	it('el vendedor queda acotado a su propio id de empleado', async () => {
		maybeSingle.mockResolvedValueOnce({ data: { id: 'emp-7' } });
		const scope = await resolveSalesScope({ id: 'u2', role: 'vendedor' });
		expect(scope).toEqual({ all: false, salesmanId: 'emp-7' });
	});
});

describe('el caso que se cae para el lado peligroso', () => {
	it('un vendedor sin ficha de empleado no ve TODO: no ve nada', async () => {
		// La falla clásica: no se pudo resolver el dueño, así que se omite el
		// filtro y la consulta devuelve la cartera entera. Acá devuelve un UUID
		// que no calza con ninguna fila.
		maybeSingle.mockResolvedValueOnce({ data: null });
		const scope = await resolveSalesScope({ id: 'huerfano', role: 'vendedor' });

		expect(scope.all).toBe(false);
		expect(scope.salesmanId).toBeNull();
		expect(scopeFilterId(scope)).toBe(NADA);
	});

	it('un rol desconocido tampoco ve todo', async () => {
		// `technician`, `hr_manager` o un rol que se agregue mañana al enum: si
		// no está en la lista de vista completa, se acota.
		maybeSingle.mockResolvedValueOnce({ data: null });
		const scope = await resolveSalesScope({ id: 'u3', role: 'technician' });
		expect(scope.all).toBe(false);
	});

	it('sin rol se acota', async () => {
		maybeSingle.mockResolvedValueOnce({ data: null });
		const scope = await resolveSalesScope({ id: 'u4', role: null });
		expect(scope.all).toBe(false);
		expect(scopeFilterId(scope)).toBe(NADA);
	});
});

describe('quién puede firmar o convertir una fila', () => {
	it('el vendedor puede con lo suyo', () => {
		expect(canActOnSalesRow({ all: false, salesmanId: 'emp-7' }, 'emp-7')).toBe(true);
	});

	it('el vendedor NO puede con la fila de un colega', () => {
		// Es el ataque directo: llamar al endpoint con el id de un presupuesto
		// ajeno. La lista filtrada no protege de eso; esto sí.
		expect(canActOnSalesRow({ all: false, salesmanId: 'emp-7' }, 'emp-9')).toBe(false);
	});

	it('una fila sin dueño no queda abierta para el vendedor', () => {
		// `null === null` sería verdadero si se comparara a la ligera, y toda
		// fila huérfana pasaría a ser de cualquiera.
		expect(canActOnSalesRow({ all: false, salesmanId: null }, null)).toBe(false);
		expect(canActOnSalesRow({ all: false, salesmanId: 'emp-7' }, null)).toBe(false);
		expect(canActOnSalesRow({ all: false, salesmanId: 'emp-7' }, undefined)).toBe(false);
	});

	it('la vista completa puede con todo, incluso con lo huérfano', () => {
		expect(canActOnSalesRow({ all: true, salesmanId: null }, null)).toBe(true);
		expect(canActOnSalesRow({ all: true, salesmanId: null }, 'emp-9')).toBe(true);
	});
});

describe('el filtro que se le pasa a la consulta', () => {
	it('con dueño filtra por el dueño', () => {
		expect(scopeFilterId({ all: false, salesmanId: 'emp-7' })).toBe('emp-7');
	});

	it('nunca devuelve vacío ni null', () => {
		// Un filtro vacío en PostgREST no filtra: devuelve todo.
		const v = scopeFilterId({ all: false, salesmanId: null });
		expect(v).toBeTruthy();
		expect(v).toMatch(/^[0-9a-f-]{36}$/);
	});
});
