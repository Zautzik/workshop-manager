import { describe, it, expect } from 'vitest';
import { computeOTCalculations, computeMultiQuantityQuotes, computeImposition, generateDefaultOperations } from '@/lib/ot-calculations';
import { INITIAL_OT_FORM, EMPTY_FINISHES } from '@/types/ot';

// Concrete form with known dimensions so we can derive expected values under
// engine v2 (multi-format + gripper 1.2 + bleed 0.3/side, qty 1000, 10×14 cm):
//   77×110 (usable H 108.8), piece w/bleed 10.6×14.6:
//     normal:  floor(77/10.6)=7 × floor(108.8/14.6)=7 → 49 poses
//     rotated: floor(77/14.6)=5 × floor(108.8/10.6)=10 → 50 poses · util 82.6%
//   (70×100 tops out at 36 poses / 72%) → best: 77×110 rotated, 50 poses.
// rawSheets = ceil(1000/50) = 20
// INITIAL_OT_FORM is cmyk front / sin_impresion back → 4 colours on the
// default 4-body press = 1 pass → make-ready 120 sheets:
// totalSheets = ceil(20*1.02) + 1*120 = 21 + 120 = 141
const FORM_10x14 = { ...INITIAL_OT_FORM, width_cm: 10, height_cm: 14 };

describe('computeOTCalculations — sheet counting', () => {
	it('returns a positive sheet count', () => {
		const c = computeOTCalculations(FORM_10x14);
		expect(c.calc_sheets).toBeGreaterThan(0);
	});

	it('applies base waste + make-ready sheets (141 for 1000 qty, 10×14 cm, 1 pass)', () => {
		const c = computeOTCalculations(FORM_10x14);
		expect(c.calc_sheets).toBe(141);
	});

	it('more passes on a smaller press → more make-ready sheets', () => {
		const onePass = computeOTCalculations(FORM_10x14, { pressBodies: 4 }); // 4/0 → 1 pass
		const fourPasses = computeOTCalculations(FORM_10x14, { pressBodies: 1 }); // 4/0 → 4 passes
		expect(fourPasses.calc_sheets).toBe(onePass.calc_sheets + 3 * 120);
	});

	it('die-cutting adds its setup sheets', () => {
		const plain = computeOTCalculations(FORM_10x14);
		const die = computeOTCalculations({ ...FORM_10x14, finishes: { ...FORM_10x14.finishes, finish_troquelado: true } });
		expect(die.calc_sheets).toBe(plain.calc_sheets + 150);
	});

	it('always returns at least the raw sheet count', () => {
		const c = computeOTCalculations(FORM_10x14);
		const rawSheets = Math.ceil(FORM_10x14.quantity / 50); // 77×110 rotated → 50 poses
		expect(c.calc_sheets).toBeGreaterThanOrEqual(rawSheets);
	});

	it('handles zero dimensions (falls back to 1 pose/sheet)', () => {
		const form = { ...INITIAL_OT_FORM, width_cm: 0, height_cm: 0 };
		const c = computeOTCalculations(form);
		expect(c.calc_sheets).toBeGreaterThan(0);
	});
});

describe('computeOTCalculations — substrate weight', () => {
	it('returns a positive substrate weight', () => {
		const c = computeOTCalculations(FORM_10x14);
		expect(c.calc_substrate_kg).toBeGreaterThan(0);
	});

	it('weight scales with grammage', () => {
		const light = computeOTCalculations({ ...FORM_10x14, grammage_gsm: 90 });
		const heavy = computeOTCalculations({ ...FORM_10x14, grammage_gsm: 300 });
		expect(heavy.calc_substrate_kg).toBeGreaterThan(light.calc_substrate_kg);
	});
});

describe('computeOTCalculations — plates', () => {
	it('cmyk front + no back = 4 plates', () => {
		const c = computeOTCalculations({ ...FORM_10x14, color_front: 'cmyk', color_back: 'sin_impresion' });
		expect(c.calc_plates).toBe(4);
	});

	it('cmyk front + cmyk back = 8 plates', () => {
		const c = computeOTCalculations({ ...FORM_10x14, color_front: 'cmyk', color_back: 'cmyk' });
		expect(c.calc_plates).toBe(8);
	});

	it('no printing = 0 plates', () => {
		const c = computeOTCalculations({ ...FORM_10x14, color_front: 'sin_impresion', color_back: 'sin_impresion' });
		expect(c.calc_plates).toBe(0);
	});

	it('1-color front + no back = 1 plate', () => {
		const c = computeOTCalculations({ ...FORM_10x14, color_front: '1_color', color_back: 'sin_impresion' });
		expect(c.calc_plates).toBe(1);
	});
});

describe('computeOTCalculations — finishing', () => {
	it('no finishes → 0 finish hours', () => {
		const c = computeOTCalculations({ ...FORM_10x14, finishes: { ...EMPTY_FINISHES } });
		expect(c.calc_finish_hours).toBe(0);
	});

	it('each active finish adds time', () => {
		// Use a high sheet count so toFixed(2) doesn't collapse both values to the same number.
		// INITIAL_OT_FORM has width_cm:0 height_cm:0 → 1 pose/sheet → 1100 sheets for qty 1000.
		const base = INITIAL_OT_FORM;
		const none = computeOTCalculations({ ...base, finishes: { ...EMPTY_FINISHES } });
		const one  = computeOTCalculations({ ...base, finishes: { ...EMPTY_FINISHES, finish_troquelado: true } });
		const two  = computeOTCalculations({ ...base, finishes: { ...EMPTY_FINISHES, finish_troquelado: true, finish_plegado: true } });
		expect(one.calc_finish_hours).toBeGreaterThan(none.calc_finish_hours);
		expect(two.calc_finish_hours).toBeGreaterThan(one.calc_finish_hours);
	});
});

describe('computeOTCalculations — ink', () => {
	it('returns positive ink usage when printing', () => {
		const c = computeOTCalculations({ ...FORM_10x14, color_front: 'cmyk' });
		expect(c.calc_ink_kg).toBeGreaterThan(0);
	});

	it('no printing → 0 ink (or near-zero due to formula)', () => {
		const c = computeOTCalculations({ ...FORM_10x14, color_front: 'sin_impresion', color_back: 'sin_impresion' });
		expect(c.calc_ink_kg).toBe(0);
	});

	it('ink scales with coverage class (heavy > medium > light)', () => {
		const base = { ...FORM_10x14, color_front: 'cmyk' as const, substrate_type: 'couche' as const };
		const light  = computeOTCalculations(base, { inkCoverage: 'light' });
		const medium = computeOTCalculations(base, { inkCoverage: 'medium' });
		const heavy  = computeOTCalculations(base, { inkCoverage: 'heavy' });
		expect(heavy.calc_ink_kg).toBeGreaterThan(medium.calc_ink_kg);
		expect(medium.calc_ink_kg).toBeGreaterThan(light.calc_ink_kg);
	});

	it('ink scales with substrate absorbency (uncoated bond > coated couche)', () => {
		const base = { ...FORM_10x14, color_front: 'cmyk' as const };
		const coated   = computeOTCalculations({ ...base, substrate_type: 'couche' });
		const uncoated = computeOTCalculations({ ...base, substrate_type: 'bond' });
		expect(uncoated.calc_ink_kg).toBeGreaterThan(coated.calc_ink_kg);
	});
});

describe('computeOTCalculations — machine speed', () => {
	it('a faster machine yields fewer print hours', () => {
		const form = { ...FORM_10x14, color_front: 'cmyk' as const };
		const slow = computeOTCalculations(form, { machineSpeedSheetsHr: 2000 });
		const fast = computeOTCalculations(form, { machineSpeedSheetsHr: 8000 });
		expect(fast.calc_print_hours).toBeLessThan(slow.calc_print_hours);
	});

	it('defaults to the 3000 sheets/hr baseline when no machine given', () => {
		const form = { ...FORM_10x14, color_front: 'cmyk' as const };
		const def     = computeOTCalculations(form);
		const at3000  = computeOTCalculations(form, { machineSpeedSheetsHr: 3000 });
		expect(def.calc_print_hours).toBe(at3000.calc_print_hours);
	});
});

describe('computeOTCalculations — pass-through-press model (v2)', () => {
	it('4/0 on a 4-body press is ONE pass; on a 1-body press it is FOUR', () => {
		const form = { ...FORM_10x14, color_front: 'cmyk' as const, color_back: 'sin_impresion' as const };
		const speedmaster = computeOTCalculations(form, { pressBodies: 4, machineSpeedSheetsHr: 3000 });
		const singleBody  = computeOTCalculations(form, { pressBodies: 1, machineSpeedSheetsHr: 3000 });
		// More passes → more make-ready hours AND more run time.
		expect(singleBody.calc_print_hours).toBeGreaterThan(speedmaster.calc_print_hours * 2);
	});

	it('4/4 doubles the passes of 4/0 on the same press', () => {
		const f40 = computeOTCalculations({ ...FORM_10x14, color_front: 'cmyk' as const, color_back: 'sin_impresion' as const }, { pressBodies: 4 });
		const f44 = computeOTCalculations({ ...FORM_10x14, color_front: 'cmyk' as const, color_back: 'cmyk' as const }, { pressBodies: 4 });
		expect(f44.calc_print_hours).toBeGreaterThan(f40.calc_print_hours);
	});

	it('finish hours differ by process (troquelado ≫ barniz)', () => {
		const die = computeOTCalculations({ ...FORM_10x14, finishes: { ...FORM_10x14.finishes, finish_troquelado: true } });
		const varnish = computeOTCalculations({ ...FORM_10x14, finishes: { ...FORM_10x14.finishes, finish_barniz: true } });
		expect(die.calc_finish_hours).toBeGreaterThan(varnish.calc_finish_hours);
	});
});

describe('computeMultiQuantityQuotes — quiebres por cantidad', () => {
	const base = {
		...FORM_10x14,
		color_front: 'cmyk' as const,
		substrate_type: 'couche' as const,
	};

	it('el precio unitario BAJA al subir la cantidad (el alistamiento se amortiza)', () => {
		const [q10k, q50k, q100k] = computeMultiQuantityQuotes(
			{ ...base, quantity: 10000 },
			[10000, 50000, 100000]
		);

		expect(q50k.unit_price).toBeLessThan(q10k.unit_price);
		expect(q100k.unit_price).toBeLessThan(q50k.unit_price);
	});

	it('la baja es material, no cosmética — el modelo escalado anterior apenas movía el unitario', () => {
		const [small, big] = computeMultiQuantityQuotes(
			{ ...base, quantity: 10000 },
			[10000, 100000]
		);
		// El papel sí escala lineal (bien), así que la baja no llega a la mitad;
		// lo que se amortiza es el alistamiento. Con ×10 de volumen eso da >30%.
		// El modelo escalado anterior daba ~10%: este umbral separa correcto de roto.
		const dropPct = ((small.unit_price - big.unit_price) / small.unit_price) * 100;
		expect(dropPct).toBeGreaterThan(30);
	});

	it('el total sí sube con la cantidad (baja el unitario, no la factura)', () => {
		const [small, big] = computeMultiQuantityQuotes(
			{ ...base, quantity: 10000 },
			[10000, 100000]
		);
		expect(big.total_price).toBeGreaterThan(small.total_price);
	});

	it('ignora cantidades no positivas en vez de emitir precios absurdos', () => {
		const out = computeMultiQuantityQuotes({ ...base, quantity: 10000 }, [0, -5, 10000]);
		expect(out).toHaveLength(1);
		expect(out[0].quantity).toBe(10000);
	});
});

describe('imposición limitada por la prensa (Ryobi 524GS)', () => {
	// Área máxima imprimible real de la 524GS: 370 × 520 mm.
	const RYOBI = { maxWidthCm: 37, maxHeightCm: 52 };

	it('nunca propone un pliego que la prensa no pueda tomar', () => {
		const impo = computeImposition(9, 12, 150000, RYOBI);
		const fits =
			(impo.format_w! <= RYOBI.maxWidthCm && impo.format_h! <= RYOBI.maxHeightCm) ||
			(impo.format_h! <= RYOBI.maxWidthCm && impo.format_w! <= RYOBI.maxHeightCm);
		expect(fits).toBe(true);
	});

	it('sin límite elegía un pliego imposible — la regresión que esto evita', () => {
		const sinLimite = computeImposition(9, 12, 150000);
		const conLimite = computeImposition(9, 12, 150000, RYOBI);
		// El formato libre (77×110) no entra en la 524GS.
		expect(sinLimite.format_w).toBeGreaterThan(RYOBI.maxWidthCm);
		expect(conLimite.format_w).toBeLessThanOrEqual(RYOBI.maxWidthCm);
	});

	it('el pliego de media prensa declara de qué formato de compra se corta', () => {
		const impo = computeImposition(9, 12, 150000, RYOBI);
		expect(impo.cut_from).toBeTruthy();
		expect(impo.cuts_per_parent).toBeGreaterThan(1);
	});

	it('respetar la prensa multiplica los pliegos, no los reduce', () => {
		const libre = computeImposition(9, 12, 150000);
		const real = computeImposition(9, 12, 150000, RYOBI);
		expect(real.sheets_needed).toBeGreaterThan(libre.sheets_needed * 3);
	});

	it('cobra el corte de resma cuando el pliego sale de partir uno comprado', () => {
		const form = {
			...FORM_10x14,
			quantity: 150000,
			color_front: 'cmyk' as const,
			substrate_type: 'couche' as const,
		};
		const impo = computeImposition(form.width_cm, form.height_cm, form.quantity, RYOBI);
		const calcs = computeOTCalculations({ ...form, imposition: impo }, { pressLimit: RYOBI });
		const ops = generateDefaultOperations({ ...form, imposition: impo }, calcs);

		const resma = ops.find((o) => o.name.startsWith('Corte de resma'));
		expect(resma).toBeDefined();
		expect(resma!.quantity).toBeGreaterThan(0);
	});

	it('no cobra corte de resma si el pliego se compra tal cual', () => {
		const form = { ...FORM_10x14, quantity: 150000, color_front: 'cmyk' as const };
		const impo = computeImposition(form.width_cm, form.height_cm, form.quantity); // sin límite
		const calcs = computeOTCalculations({ ...form, imposition: impo });
		const ops = generateDefaultOperations({ ...form, imposition: impo }, calcs);
		expect(ops.find((o) => o.name.startsWith('Corte de resma'))).toBeUndefined();
	});
});

/* ─── Calibración: las proporciones que un impresor reconoce ── */

describe('CALIBRATION — la tinta pesa lo que pesa', () => {
	// Un estuche plegadizo real: 20×30 cm, cartulina 300 g, 4/0, 200.000
	// unidades en una Ryobi 524GS (media prensa 35×50).
	const RYOBI = { maxWidthCm: 37, maxHeightCm: 52 };
	const ESTUCHE = {
		...INITIAL_OT_FORM,
		quantity: 200_000,
		width_cm: 20, height_cm: 30,
		grammage_gsm: 300,
		substrate_type: 'cartulina' as const,
		color_front: 'cmyk' as const,
	};

	it('la tinta queda en la banda de 1 a 1,5 g/m² por color', () => {
		const c = computeOTCalculations(ESTUCHE, { pressLimit: RYOBI, pressBodies: 4 });
		const areaM2 = c.calc_sheets * 0.35 * 0.5;
		// 4 colores al frente, sin retiro.
		const gramosPorM2PorColor = (c.calc_ink_kg * 1000) / areaM2 / 4;
		expect(gramosPorM2PorColor).toBeGreaterThan(1);
		expect(gramosPorM2PorColor).toBeLessThan(1.5);
	});

	it('la tinta no compite con el papel en el costo del trabajo', () => {
		// La prueba que fallaba: con 0,003 kg/pliego la tinta salía $11,3 millones
		// contra $15,0 de cartulina. La tinta de una imprenta es un accesorio caro,
		// no la mitad de la materia prima.
		const c = computeOTCalculations(ESTUCHE, { pressLimit: RYOBI, pressBodies: 4 });
		const ops = generateDefaultOperations(ESTUCHE, c, { substrate_per_kg: 2800, ink_per_kg: 31915 });
		const papel = ops.find((o) => o.name === 'Sustrato/Papel')!.total_cost;
		const tinta = ops.find((o) => o.name === 'Tintas')!.total_cost;
		expect(tinta / papel).toBeLessThan(0.25);
	});
});

describe('CALIBRATION — el troquelado corre a la velocidad de la troqueladora', () => {
	it('100.000 pliegos se troquelan en unas 30 horas, no en 85', () => {
		// `machines.optimal_speed_sheets_hr` de la troqueladora dice 3.500 pliegos
		// por hora. Costear a 1.200 inventaba 57 horas de máquina que nadie trabajó.
		const c = computeOTCalculations(
			{ ...FORM_10x14, quantity: 100_000, finishes: { ...EMPTY_FINISHES, finish_troquelado: true } },
		);
		// setup 1,5 h + pliegos/3.500
		expect(c.calc_finish_hours).toBeCloseTo(1.5 + c.calc_sheets / 3500, 1);
		expect(c.calc_finish_hours).toBeLessThan(40);
	});
});
