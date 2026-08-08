import { describe, expect, it } from 'vitest';

import { checkMaterialPrice, chooseMaterialPrice } from '../material-price-sanity';

describe('checkMaterialPrice', () => {
	it('rechaza los valores reales que hoy corrompen el costeo', () => {
		// Estos son los ponderados que `material_cost_v` devuelve hoy en producción
		// y que el motor prefiere sobre el catálogo.
		for (const [nombre, valor] of [
			['Cartulina C1S 300gsm', 3.2],
			['Cartulina C1S 400gsm', 4.1],
			['Couche sheet 115gsm', 1.95],
			['Couche sheet 150gsm', 2.5],
			['Couche adhesivo roll 60gsm', 1.8103],
		] as const) {
			const r = checkMaterialPrice({ value: valor, unit: 'kg' }, 'kg');
			expect(r.usable, `${nombre} a $${valor}/kg debería rechazarse`).toBe(false);
			expect(r.verdict).toBe('fuera_de_escala');
			expect(r.reason).toContain('demasiado bajo');
		}
	});

	it('acepta los precios reales que sí son creíbles', () => {
		for (const valor of [3500, 16000, 18500, 2800, 1143]) {
			expect(checkMaterialPrice({ value: valor, unit: 'kg' }, 'kg').usable).toBe(true);
		}
	});

	it('detecta la colisión de unidades resma contra kg', () => {
		// «Papel Bond 75g 70×100» vale $12.500 la RESMA. Cobrado como kilo el
		// error va al otro lado: unas once veces de más.
		const r = checkMaterialPrice({ value: 12500, unit: 'resma' }, 'kg');
		expect(r.usable).toBe(false);
		expect(r.verdict).toBe('unidad_incompatible');
		expect(r.reason).toContain('resma');
		expect(r.reason).toContain('kg');
	});

	it('el mismo valor es válido en su propia unidad', () => {
		expect(checkMaterialPrice({ value: 12500, unit: 'resma' }, 'resma').usable).toBe(true);
	});

	it('sin unidad declarada no bloquea, sólo revisa la escala', () => {
		// Muchas filas antiguas no traen unidad. Rechazarlas por eso dejaría al
		// motor sin ningún precio; se revisa la escala, que es lo que delata.
		expect(checkMaterialPrice({ value: 2800, unit: null }, 'kg').usable).toBe(true);
		expect(checkMaterialPrice({ value: 3.2, unit: null }, 'kg').usable).toBe(false);
	});

	it('cero, negativo y nulo son «sin precio», no cero pesos', () => {
		for (const v of [0, -5, null, undefined]) {
			const r = checkMaterialPrice({ value: v, unit: 'kg' }, 'kg');
			expect(r.verdict).toBe('sin_precio');
			expect(r.usable).toBe(false);
		}
	});
});

describe('chooseMaterialPrice', () => {
	it('el caso real: descarta el ponderado corrupto y usa el catálogo', () => {
		// Cartulina C1S 300gsm — lo que pasa hoy vs lo que debería pasar.
		const c = chooseMaterialPrice(
			{ value: 3.2, unit: 'kg' },      // material_cost_v — lo que el motor prefiere hoy
			{ value: 2800, unit: 'kg' },     // cost_catalog — lo correcto
			'kg',
		);
		expect(c.value).toBe(2800);
		expect(c.source).toBe('catalogo');
		expect(c.warning).toContain('Se ignoró el costo real');
	});

	it('cuando el costo real es creíble, sigue mandando sobre el catálogo', () => {
		// La regla original es buena; sólo hacía falta la comprobación.
		const c = chooseMaterialPrice(
			{ value: 3100, unit: 'kg' },
			{ value: 2800, unit: 'kg' },
			'kg',
		);
		expect(c.value).toBe(3100);
		expect(c.source).toBe('real');
		expect(c.warning).toBeNull();
	});

	it('sin costo real usa el catálogo sin advertir nada', () => {
		const c = chooseMaterialPrice(null, { value: 2800, unit: 'kg' }, 'kg');
		expect(c.source).toBe('catalogo');
		expect(c.warning).toBeNull();
	});

	it('si ninguno sirve devuelve null y explica — nunca un número inventado', () => {
		const c = chooseMaterialPrice({ value: 3.2, unit: 'kg' }, { value: 0, unit: 'kg' }, 'kg');
		expect(c.value).toBeNull();
		expect(c.source).toBe('ninguno');
		expect(c.warning).toBeTruthy();
	});

	it('nunca devuelve un sustrato bajo $100/kg — la invariante del informe', () => {
		for (const malo of [0.5, 1.8, 3.2, 4.1, 22, 99]) {
			const c = chooseMaterialPrice({ value: malo, unit: 'kg' }, { value: malo, unit: 'kg' }, 'kg');
			expect(c.value, `$${malo}/kg no puede pasar`).toBeNull();
		}
	});
});
