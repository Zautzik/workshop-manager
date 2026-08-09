import { describe, expect, it } from 'vitest';

import { parseWhatsAppMessage } from '../../../src/lib/whatsapp-parser';
import { evaluateMerma } from '../../../src/lib/merma';
import { marginPerPressHour, costPerThousand } from '../../../src/lib/print-economics';
import {
	CLIENT_BOOK,
	scheduleCrew,
	DEVIATIONS,
	MONTHLY_MARGIN_TARGET_CLP,
	PRODUCT_LINES,
	buildJob,
	categoryOf,
	planMonth,
	rng,
	type Plant,
} from '../model';

/* ─── Una planta de prueba con la forma de la real ───────────── */

const persona = (id: string, name: string, hourlyRate: number) => ({ id, name, hourlyRate });

const PLANT: Plant = {
	presses: [
		{ id: 'ryobi-1', name: 'Ryobi Offset 524GS #1', key: 'ryobi', bodies: 4, speedSheetsHr: 7500, maxWidthCm: 37, maxHeightCm: 52 },
		{ id: 'roland', name: 'Roland 300', key: 'roland', bodies: 1, speedSheetsHr: 9000, maxWidthCm: 37, maxHeightCm: 52 },
	],
	dieCutterId: 'troquel',
	guillotineIds: ['guillo-1'],
	finisherMachineIds: ['dobladora'],
	crew: {
		press: [persona('p1', 'Carlos Muñoz', 8500), persona('p2', 'Jorge Herrera', 8200)],
		cut: [persona('c1', 'Roberto Castro', 7000)],
		finish: [persona('f1', 'María González', 6500), persona('f2', 'Ana Martínez', 6500)],
		prepress: [persona('pp1', 'Andrea Soto', 9000)],
	},
	rates: {
		substrate_per_kg: 2800, ink_per_kg: 31915, plate_per_unit: 8500,
		offset_print_per_hour: 85000, cut_per_hour: 18000, troquelado_per_hour: 25000,
		plegado_per_hour: 15000, pegado_per_hour: 20000, laminado_per_hour: 3500,
		barniz_per_hour: 25000, relieve_per_hour: 6000, perforado_per_hour: 8000,
		hot_stamping_per_hour: 40000, uv_localizado_per_hour: 35000, numeracion_per_hour: 12000,
		press_labor_per_hour: 8500, finish_labor_per_hour: 6500, overhead_pct: 8,
	},
	machineHourCost: { 'ryobi-1': 12000, roland: 7000 },
};

const unJob = (lineKey = 'estuche_alimento', quantity = 200_000, seed = 7) => {
	const j = buildJob({
		otNumber: '40501',
		vbNumber: 'VB-202605-001',
		month: '2026-05',
		client: CLIENT_BOOK[0],
		line: PRODUCT_LINES.find((l) => l.key === lineKey)!,
		quantity,
		plant: PLANT,
		quotedOn: new Date(Date.UTC(2026, 4, 2, 12)),
		startedOn: new Date(Date.UTC(2026, 4, 11, 12)),
		finishedOn: new Date(Date.UTC(2026, 4, 16, 12)),
		status: 'completed',
		finishingOutsourced: false,
		r: rng(seed),
	});
	// Un trabajo sin turnos repartidos todavía no tiene mano de obra: el
	// turnero es parte de construirlo, no un adorno posterior.
	scheduleCrew([j], PLANT, { seed });
	return j;
};

/* ─── El modelo del taller ───────────────────────────────────── */

describe('el catálogo describe una imprenta, no un promedio', () => {
	it('los márgenes NO son parejos entre líneas', () => {
		// Si todo dejara lo mismo, Analítica no tendría nada que mostrar. El
		// estuche de vino deja el triple que el instructivo, y ése es el hallazgo
		// que la app existe para poner delante.
		const margenes = PRODUCT_LINES.map((l) => l.marginPct);
		expect(Math.max(...margenes) / Math.min(...margenes)).toBeGreaterThan(2.5);
	});

	it('la cartera tiene forma de cartera: cinco cuentas hacen la mitad', () => {
		const pesos = [...CLIENT_BOOK].sort((a, b) => b.weight - a.weight);
		const total = pesos.reduce((s, c) => s + c.weight, 0);
		const top5 = pesos.slice(0, 5).reduce((s, c) => s + c.weight, 0);
		expect(top5 / total).toBeGreaterThan(0.45);
		expect(top5 / total).toBeLessThan(0.62);
	});

	it('cada cliente compra algo que el taller sabe hacer', () => {
		const claves = new Set(PRODUCT_LINES.map((l) => l.key));
		for (const c of CLIENT_BOOK) {
			expect(c.buys.length).toBeGreaterThan(0);
			for (const b of c.buys) expect(claves.has(b)).toBe(true);
		}
	});

	it('los motivos de desvío suman una probabilidad completa', () => {
		const total = DEVIATIONS.reduce((s, d) => s + d.probability, 0);
		expect(total).toBeCloseTo(1, 2);
	});
});

/* ─── El hilo de oro dentro de un trabajo ────────────────────── */

describe('un trabajo cuadra consigo mismo', () => {
	it('el costo real es la suma de sus partidas, no un número aparte', () => {
		const j = unJob();
		expect(j.actualCost).toBe(j.actualLines.reduce((s, l) => s + l.total, 0));
		expect(j.estimatedCost).toBe(j.estimateLines.reduce((s, l) => s + l.total, 0));
		expect(j.grossMargin).toBe(j.revenue - j.actualCost);
	});

	it('la mano de obra real sale de los turnos, no de un porcentaje', () => {
		// Es lo que hace que «Rentabilidad» y «Mano de obra» digan lo mismo:
		// las dos leen a la misma gente trabajando las mismas horas.
		const j = unJob();
		const desdeTurnos = j.crew.reduce((s, c) => s + c.cost, 0);
		const linea = j.actualLines.find((l) => l.category === 'labor')!;
		expect(linea.total).toBe(desdeTurnos);
		expect(desdeTurnos).toBeGreaterThan(0);
	});

	it('todo turno lleva la OT: nadie trabaja para nadie', () => {
		// Sin `ot_id` la mano de obra vale cero en toda la app y el margen sale
		// 100%. El generador no sabe emitir un turno huérfano.
		const j = unJob();
		expect(j.crew.length).toBeGreaterThan(0);
		for (const t of j.crew) {
			expect(t.hours).toBeGreaterThan(0);
			expect(t.hours).toBeLessThanOrEqual(8);
			expect(t.personId).toBeTruthy();
			expect(t.machineId).toBeTruthy();
		}
	});

	it('el operador de prensa se cuenta como mano de obra, no como máquina', () => {
		const j = unJob();
		const operador = j.operations.find((o) => o.name === 'Operador de Prensa')!;
		expect(categoryOf(operador)).toBe('labor');
		const impresion = j.operations.find((o) => o.name === 'Impresión Offset')!;
		expect(categoryOf(impresion)).toBe('machine');
	});

	it('entraron más pliegos de los que salieron vendibles', () => {
		const j = unJob();
		expect(j.sheetsEntered).toBeGreaterThan(0);
		expect(j.sheetsWasted).toBeGreaterThan(0);
		expect(j.sheetsWasted).toBeLessThan(j.sheetsEntered);
	});

	it('el estuche de vino deja más por hora de prensa que el instructivo', () => {
		// La comparación que decide qué se programa el lunes.
		const vino = unJob('estuche_vino', 100_000, 3);
		const instructivo = unJob('instructivo', 100_000, 3);

		const v = marginPerPressHour({ revenue: vino.revenue, cost: vino.actualCost, pressHours: vino.pressHours });
		const i = marginPerPressHour({ revenue: instructivo.revenue, cost: instructivo.actualCost, pressHours: instructivo.pressHours });
		expect(v.marginPerHour!).toBeGreaterThan(i.marginPerHour!);
	});

	it('el costo por millar queda en escala de imprenta', () => {
		const j = unJob();
		const millar = costPerThousand({ cost: j.actualCost, sheets: j.sheetsEntered })!;
		expect(millar).toBeGreaterThan(50_000);
		expect(millar).toBeLessThan(900_000);
	});
});

/* ─── Los partes del taller son partes de verdad ─────────────── */

describe('las capturas las lee el analizador de la app', () => {
	it('el mensaje de cierre se lee con los números que se quisieron decir', () => {
		const j = unJob();
		const cierres = j.captures.filter((c) => c.kind === 'end');
		expect(cierres.length).toBeGreaterThan(0);

		const conMerma = cierres[cierres.length - 1];
		const leido = parseWhatsAppMessage(conMerma.text);
		expect(leido.message_type).toBe('end');
		expect(leido.ot_number).toBe(j.otNumber);
		expect(leido.production_data!.merma).toBe(j.sheetsWasted);
		expect(leido.production_data!.hours_reported).toBeGreaterThan(0);
	});

	it('el arranque se reconoce como arranque', () => {
		const j = unJob();
		const inicio = j.captures.find((c) => c.kind === 'start')!;
		const leido = parseWhatsAppMessage(inicio.text);
		expect(leido.message_type).toBe('start');
		expect(leido.ot_number).toBe(j.otNumber);
	});

	it('sumando los partes se reconstruye la merma del trabajo', () => {
		// Es la prueba que importa: el porcentaje que muestra Analítica se puede
		// derivar de lo que el taller escribió, sin pasar por el generador.
		const j = unJob();
		const leidos = j.captures
			.filter((c) => c.kind === 'end')
			.map((c) => parseWhatsAppMessage(c.text).production_data!);

		const merma = leidos.reduce((s, p) => s + (p!.merma ?? 0), 0);
		const buenos = leidos.reduce((s, p) => s + (p!.buenos ?? 0), 0);
		const v = evaluateMerma({ merma, buenos });

		expect(v.entered).toBe(j.sheetsEntered);
		expect(v.wasted).toBe(j.sheetsWasted);
		expect(v.rate!).toBeCloseTo(j.sheetsWasted / j.sheetsEntered, 6);
	});
});

/* ─── El mes llega a la escala pedida ────────────────────────── */

describe('el plan mensual alcanza los $300 millones de margen', () => {
	const mayo = planMonth({
		month: '2026-05', plant: PLANT, seed: 20260501,
		targetMargin: MONTHLY_MARGIN_TARGET_CLP, throughDay: 31, startingOtNumber: 41001,
		leaveWorkOpen: false, finishingCapacityHours: 2_112,
	});

	it('el margen bruto del mes llega al objetivo sin pasarse de largo', () => {
		expect(mayo.grossMargin).toBeGreaterThanOrEqual(MONTHLY_MARGIN_TARGET_CLP);
		// El último trabajo empuja por encima; que no sea por el doble.
		expect(mayo.grossMargin).toBeLessThan(MONTHLY_MARGIN_TARGET_CLP * 1.2);
	});

	it('el margen sobre la venta es el de una imprenta, no el de una startup', () => {
		const pct = mayo.grossMargin / mayo.revenue;
		expect(pct).toBeGreaterThan(0.12);
		expect(pct).toBeLessThan(0.35);
	});

	it('no todos los trabajos ganan: alguno sale mal', () => {
		// Un mes donde nada se desvía no es un mes, es un folleto.
		const malos = mayo.jobs.filter((j) => j.closed && j.grossMargin / j.revenue < 0.08);
		expect(malos.length).toBeGreaterThan(0);
	});

	it('un mes cerrado no deja trabajo botado en la máquina', () => {
		// Sólo el mes en curso tiene OT a medio hacer.
		expect(mayo.jobs.every((j) => j.closed)).toBe(true);
	});

	it('lo que no cabe en las máquinas propias se manda afuera', () => {
		// El cuello de botella de una imprenta son las terminaciones, no la
		// prensa. Con 2.112 horas propias al mes y un plan que pide muchas más,
		// el taller subcontrata — y la base lo dice en vez de fingir capacidad.
		expect(mayo.finishHoursInHouse).toBeLessThanOrEqual(2_112);
		expect(mayo.finishHoursOutsourced).toBeGreaterThan(0);
		const fuera = mayo.jobs.filter((j) => j.finishingOutsourced);
		for (const j of fuera) {
			expect(j.actualLines.some((l) => l.category === 'outsourced')).toBe(true);
			// Si se hizo afuera, nadie del taller cargó horas de terminación.
			expect(j.crew.some((c) => c.role === 'Terminaciones')).toBe(false);
		}
	});

	it('la carga cabe en dos turnos de las prensas del taller', () => {
		// Tres prensas × 2 turnos × 22 días × 8 h = 1.056 horas-prensa al mes.
		// Si el plan pide más, el taller no existe y hay que decirlo.
		expect(mayo.pressHours).toBeLessThan(1_056);
	});

	it('sembrar dos veces con la misma semilla da el mismo mes', () => {
		const otra = planMonth({
			month: '2026-05', plant: PLANT, seed: 20260501,
			targetMargin: MONTHLY_MARGIN_TARGET_CLP, throughDay: 31, startingOtNumber: 41001,
			leaveWorkOpen: false, finishingCapacityHours: 2_112,
		});
		expect(otra.jobs.length).toBe(mayo.jobs.length);
		expect(otra.grossMargin).toBe(mayo.grossMargin);
	});
});

/* ─── El turnero respeta lo que la base va a exigir ──────────── */

describe('el turnero no escribe lo que Postgres va a rechazar', () => {
	const mes = planMonth({
		month: '2026-06', plant: PLANT, seed: 20260601,
		targetMargin: MONTHLY_MARGIN_TARGET_CLP, throughDay: 30, startingOtNumber: 42000,
		leaveWorkOpen: false, finishingCapacityHours: 2_112,
	});
	const turnos = mes.jobs.flatMap((j) => j.crew);

	it('nadie tiene dos turnos el mismo día', () => {
		// El disparador de la base cuenta las horas del TURNO, no las trabajadas:
		// dos asignaciones en un día son 16 horas y el contrato permite 9. Sin
		// esta regla la siembra revienta a mitad de camino.
		const vistos = new Set<string>();
		for (const t of turnos) {
			const clave = `${t.personId}|${t.date}`;
			expect(vistos.has(clave)).toBe(false);
			vistos.add(clave);
		}
	});

	it('nadie pasa de cinco turnos en una semana', () => {
		const porSemana = new Map<string, number>();
		for (const t of turnos) {
			const d = new Date(t.date + 'T00:00:00Z');
			const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000)
				.toISOString().slice(0, 10);
			const k = `${t.personId}|${lunes}`;
			porSemana.set(k, (porSemana.get(k) ?? 0) + 1);
		}
		expect(Math.max(...porSemana.values())).toBeLessThanOrEqual(5);
	});

	it('todo turno tiene persona con nombre', () => {
		for (const t of turnos) {
			expect(t.personId).toBeTruthy();
			expect(t.personName).toBeTruthy();
			expect(t.cost).toBeGreaterThan(0);
		}
	});

	it('el mes sigue llegando al objetivo después de repartir los turnos', () => {
		// Repartir cambia el costo de mano de obra —cada persona cobra lo suyo—
		// así que el margen se mueve. Que se mueva poco es la afirmación.
		expect(mes.grossMargin).toBeGreaterThan(MONTHLY_MARGIN_TARGET_CLP * 0.97);
		expect(mes.grossMargin).toBeLessThan(MONTHLY_MARGIN_TARGET_CLP * 1.2);
	});
});
