import { describe, expect, it } from 'vitest';

import { consumeMaterial, materialForPartial } from '../partial-advance';

describe('materialForPartial', () => {
	// El caso del enunciado.
	it('la mitad de las unidades mueve la mitad del papel', () => {
		const r = materialForPartial({ movedUnits: 3000, totalUnits: 6000, totalSheets: 1600 });
		expect(r.fraction).toBe(0.5);
		expect(r.sheets).toBe(800);
		expect(r.note).toContain('50% de las unidades');
	});

	it('el trabajo completo mueve todo', () => {
		const r = materialForPartial({ movedUnits: 6000, totalUnits: 6000, totalSheets: 1600 });
		expect(r.sheets).toBe(1600);
		expect(r.note).toContain('El trabajo completo');
	});

	// El detalle que hace que la cuenta simple esté mal: el arreglo se gasta una
	// vez, así que el primer fragmento se lo lleva entero.
	it('el arreglo va COMPLETO con el primer fragmento', () => {
		const r = materialForPartial({
			movedUnits: 3000, totalUnits: 6000, totalSheets: 1600, makeReadySheets: 300,
		});
		// 1600 - 300 = 1300 de tiraje; la mitad son 650; más los 300 de arreglo.
		expect(r.runSheets).toBe(650);
		expect(r.makeReadySheets).toBe(300);
		expect(r.sheets).toBe(950);
		expect(r.note).toContain('se gastan una sola vez');
	});

	it('el segundo fragmento no vuelve a arreglar la máquina', () => {
		const r = materialForPartial({
			movedUnits: 3000, totalUnits: 6000, totalSheets: 1600,
			makeReadySheets: 300, isFirstFragment: false,
		});
		expect(r.makeReadySheets).toBe(0);
		expect(r.sheets).toBe(650);
		expect(r.note).toContain('ya se gastó');
	});

	// Los dos fragmentos juntos suman más que el total, y está bien: el arreglo
	// es papel que se gasta de verdad y no aparecía en ningún lado.
	it('los dos fragmentos cubren el trabajo entero', () => {
		const base = { totalUnits: 6000, totalSheets: 1600, makeReadySheets: 300 };
		const a = materialForPartial({ ...base, movedUnits: 3000, isFirstFragment: true });
		const b = materialForPartial({ ...base, movedUnits: 3000, isFirstFragment: false });
		expect(a.sheets + b.sheets).toBe(1600);
	});

	// Faltar un pliego para la máquina con el trabajo montado; sobrar uno se
	// devuelve a bodega.
	it('redondea hacia arriba', () => {
		const r = materialForPartial({ movedUnits: 1, totalUnits: 3, totalSheets: 1000 });
		expect(r.sheets).toBe(334);
	});

	it('no se pasa del total aunque se pidan más unidades', () => {
		const r = materialForPartial({ movedUnits: 99999, totalUnits: 6000, totalSheets: 1600 });
		expect(r.sheets).toBe(1600);
	});

	it('cero unidades no mueve tiraje', () => {
		const r = materialForPartial({ movedUnits: 0, totalUnits: 6000, totalSheets: 1600 });
		expect(r.runSheets).toBe(0);
	});

	it('un total en cero no rompe la división', () => {
		expect(() => materialForPartial({ movedUnits: 5, totalUnits: 0, totalSheets: 100 })).not.toThrow();
	});
});

describe('consumeMaterial', () => {
	it('salir de bodega hacia corte o prensa consume papel', () => {
		expect(consumeMaterial('in_storage', 'guillotine_first_cut')).toBe(true);
		expect(consumeMaterial('in_storage', 'offset_printing')).toBe(true);
		expect(consumeMaterial('in_storage', 'digital_printing')).toBe(true);
	});

	// Las etapas posteriores mueven producto semiterminado: volver a descontar
	// sería contar dos veces el mismo papel.
	it('los saltos posteriores no vuelven a descontar', () => {
		expect(consumeMaterial('offset_printing', 'die_cutting')).toBe(false);
		expect(consumeMaterial('die_cutting', 'workshop')).toBe(false);
	});

	it('llegar a bodega no consume nada', () => {
		expect(consumeMaterial('paper_purchase', 'in_storage')).toBe(false);
	});
});
