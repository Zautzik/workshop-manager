import { describe, expect, it } from 'vitest';

import { isUsable, matchJobs, priceDrift, specFrom, type PastJob } from '../job-precedent';

const trabajo = (over: Partial<PastJob> = {}): PastJob => ({
	id: 'a', ot_number: '41001', client_name: 'Viña Coirón del Maule', client_id: 'c1',
	product_name: 'Etiqueta de botella', product_type: 'etiqueta',
	quantity: 120_000, width_cm: 10, height_cm: 12,
	substrate_type: 'couche', grammage_gsm: 150,
	color_front: 'cmyk_pantone', color_back: 'sin_impresion', ink_coverage: 'heavy',
	total_price: 6_240_000, created_at: '2026-03-14T12:00:00Z',
	...over,
});

describe('qué sirve como precedente', () => {
	it('un trabajo sin medidas no sirve', () => {
		// Heredar de un trabajo sin medidas arrastra ceros a la imposición y
		// produce una cotización que se ve bien y no significa nada.
		expect(isUsable(trabajo({ width_cm: null }))).toBe(false);
		expect(isUsable(trabajo({ height_cm: 0 }))).toBe(false);
		expect(isUsable(trabajo({ quantity: 0 }))).toBe(false);
		expect(isUsable(trabajo())).toBe(true);
	});
});

describe('la búsqueda', () => {
	const todos = [
		trabajo({ id: '1', ot_number: '41001', client_name: 'Viña Coirón del Maule', created_at: '2026-03-14T12:00:00Z' }),
		trabajo({ id: '2', ot_number: '41055', client_name: 'Viña Coirón del Maule', created_at: '2026-06-02T12:00:00Z' }),
		trabajo({ id: '3', ot_number: '41100', client_name: 'Salmones Chaicura', product_name: 'Estuche' }),
		trabajo({ id: '4', ot_number: '41200', width_cm: null }),
	];

	it('sin término no devuelve nada, a propósito', () => {
		// Mostrar «los últimos seis» invita a elegir el primero que aparece, y el
		// precedente equivocado es peor que ninguno.
		expect(matchJobs(todos, '')).toEqual([]);
		expect(matchJobs(todos, '   ')).toEqual([]);
	});

	it('busca por cliente, por producto y por número de OT', () => {
		expect(matchJobs(todos, 'coirón').map((o) => o.id)).toEqual(['2', '1']);
		expect(matchJobs(todos, 'estuche').map((o) => o.id)).toEqual(['3']);
		expect(matchJobs(todos, '41100').map((o) => o.id)).toEqual(['3']);
	});

	it('el más reciente primero', () => {
		// Si un cliente repite, la última corrida trae las correcciones que se le
		// fueron haciendo al trabajo.
		expect(matchJobs(todos, 'coirón')[0].ot_number).toBe('41055');
	});

	it('descarta los que no sirven aunque coincidan', () => {
		expect(matchJobs(todos, '41200')).toEqual([]);
	});

	it('no distingue mayúsculas', () => {
		expect(matchJobs(todos, 'SALMONES')).toHaveLength(1);
	});
});

describe('lo que se hereda', () => {
	it('traduce el modo de color a cantidad de colores', () => {
		const s = specFrom(trabajo());
		expect(s.colors_front).toBe(5); // cmyk_pantone
		expect(s.colors_back).toBe(0);  // sin_impresion
	});

	it('conserva medidas, sustrato y cobertura', () => {
		const s = specFrom(trabajo());
		expect(s).toMatchObject({
			width_cm: 10, height_cm: 12, substrate_type: 'couche',
			grammage_gsm: 150, ink_coverage: 'heavy', quantity: 120_000,
		});
	});

	it('deja el rastro del trabajo del que salió', () => {
		expect(specFrom(trabajo()).ot_anterior).toBe('41001');
	});

	it('una cobertura desconocida cae en media, no en vacío', () => {
		expect(specFrom(trabajo({ ink_coverage: null })).ink_coverage).toBe('medium');
		expect(specFrom(trabajo({ ink_coverage: 'rarísima' })).ink_coverage).toBe('medium');
	});

	it('NO hereda el precio', () => {
		// Es la decisión que evita repetir un error de cotización durante dos
		// años. El precio se recalcula con las tarifas de hoy.
		expect(Object.keys(specFrom(trabajo()))).not.toContain('total_price');
	});
});

describe('la deriva de precio', () => {
	it('compara por unidad, no por total', () => {
		// El cliente casi nunca repite la misma cantidad. $6M contra $9M no dice
		// nada si uno es de 100.000 y el otro de 150.000.
		const v = priceDrift({
			pastTotal: 6_000_000, pastQuantity: 100_000,
			nowTotal: 9_000_000, nowQuantity: 150_000,
		});
		expect(v.direction).toBe('igual'); // $60 la unidad las dos veces
	});

	it('detecta la subida y la dice en el idioma del vendedor', () => {
		const v = priceDrift({
			pastTotal: 6_000_000, pastQuantity: 100_000,
			nowTotal: 7_080_000, nowQuantity: 100_000,
		});
		expect(v.direction).toBe('sube');
		expect(v.pct!).toBeCloseTo(0.18, 4);
		expect(v.note).toContain('18%');
		expect(v.note).toContain('antes de llamar');
	});

	it('detecta la baja', () => {
		const v = priceDrift({
			pastTotal: 6_000_000, pastQuantity: 100_000,
			nowTotal: 5_400_000, nowQuantity: 100_000,
		});
		expect(v.direction).toBe('baja');
		expect(v.note).toContain('barato');
	});

	it('una diferencia menor al 2% no se menciona como cambio', () => {
		const v = priceDrift({
			pastTotal: 6_000_000, pastQuantity: 100_000,
			nowTotal: 6_060_000, nowQuantity: 100_000,
		});
		expect(v.direction).toBe('igual');
	});

	it('sin precio anterior no inventa una comparación', () => {
		const v = priceDrift({ pastTotal: null, pastQuantity: 100_000, nowTotal: 6_000_000, nowQuantity: 100_000 });
		expect(v.pct).toBeNull();
		expect(v.direction).toBe('sin_datos');
		expect(v.note).toContain('no tiene precio cargado');
	});

	it('cantidad cero no divide por cero', () => {
		const v = priceDrift({ pastTotal: 6_000_000, pastQuantity: 0, nowTotal: 6_000_000, nowQuantity: 0 });
		expect(v.pct).toBeNull();
	});
});
