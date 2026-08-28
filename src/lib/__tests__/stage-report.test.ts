import { describe, expect, it } from 'vitest';
import {
	MAX_HORAS_POR_ETAPA,
	estimatedHoursFor,
	firstProblem,
	openPassesMessage,
	promptsStageReport,
	validateStageReport,
} from '@/lib/stage-report';

describe('promptsStageReport', () => {
	it('pide la pasada en las ocho etapas que esta casa ejecuta', () => {
		for (const stage of [
			'guillotine_first_cut',
			'offset_printing',
			'digital_printing',
			'die_cutting',
			'guillotine_final_cut',
			'workshop',
			'workshop_revision',
			'in_delivery',
		]) {
			expect(promptsStageReport(stage), stage).toBe(true);
		}
	});

	it('el reparto se cierra como cualquier máquina', () => {
		// «Entregado, 3 horas, el cliente no tenía quien recibiera» es el mismo
		// parte que manda el prensista, y hasta ahora no tenía dónde entrar.
		expect(promptsStageReport('in_delivery')).toBe(true);
	});

	it('no lo pide en diseño, compras, bodega ni al quedar listo', () => {
		for (const stage of [
			'pre_press',
			'visto_bueno',
			'paper_purchase',
			'in_storage',
			'ready_for_delivery',
			'completed',
		]) {
			expect(promptsStageReport(stage), stage).toBe(false);
		}
	});

	it('no lo pide en tercerizado: las horas son de otro taller', () => {
		expect(promptsStageReport('outsourced')).toBe(false);
	});
});

describe('validateStageReport — horas', () => {
	it('acepta un cierre con horas y nada más', () => {
		const check = validateStageReport({ hours: 3.5 });
		expect(check.ok).toBe(true);
		expect(check.problems).toEqual([]);
	});

	it('sin horas la pasada queda abierta, no rechazada', () => {
		// Frenar la tarjeta no hace que alguien cargue el dato: hace que el
		// trabajo se mueva por fuera del sistema.
		const check = validateStageReport({ hours: null });
		expect(check.ok).toBe(true);
		expect(check.open).toBe(true);
		expect(check.problems).toEqual([]);
	});

	it('con horas la pasada queda cerrada', () => {
		expect(validateStageReport({ hours: 3 }).open).toBe(false);
	});

	it('rechaza cero, negativo y no-número: eso no es «no sé», es un error', () => {
		for (const hours of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
			const check = validateStageReport({ hours });
			expect(check.ok, String(hours)).toBe(false);
			expect(check.problems[0].field).toBe('hours');
		}
	});

	it('ataja el minuto escrito como hora', () => {
		const check = validateStageReport({ hours: 480 });
		expect(check.ok).toBe(false);
		expect(firstProblem(check)).toContain('dividí por 60');
	});

	it('deja pasar el tope exacto', () => {
		expect(validateStageReport({ hours: MAX_HORAS_POR_ETAPA }).ok).toBe(true);
	});

	it('avisa —sin bloquear— cuando pasa de un día corrido', () => {
		const check = validateStageReport({ hours: 30 });
		expect(check.ok).toBe(true);
		expect(check.warnings.some((w) => w.includes('día corrido'))).toBe(true);
	});
});

describe('validateStageReport — merma', () => {
	it('rechaza merma negativa', () => {
		const check = validateStageReport({ hours: 2, mermaSheets: -5 });
		expect(check.ok).toBe(false);
		expect(check.problems[0].field).toBe('mermaSheets');
	});

	it('rechaza perder más pliegos de los que entraron', () => {
		const check = validateStageReport({ hours: 2, mermaSheets: 900 }, { enteredSheets: 800 });
		expect(check.ok).toBe(false);
		expect(firstProblem(check)).toContain('800');
	});

	it('exige explicación cuando la merma es crítica para el tiraje', () => {
		// 5.000 de 50.000 pliegos = 10% en tramo largo: más del doble del 5% tolerable.
		const check = validateStageReport({ hours: 6, mermaSheets: 5_000 }, { enteredSheets: 50_000 });
		expect(check.ok).toBe(false);
		expect(check.problems[0].field).toBe('wasteNotes');
	});

	it('la explicación destraba el cierre crítico', () => {
		const check = validateStageReport(
			{ hours: 6, mermaSheets: 5_000, wasteNotes: 'Se movió el registro toda la mañana.' },
			{ enteredSheets: 50_000 },
		);
		expect(check.ok).toBe(true);
	});

	it('una merma alta avisa pero no frena', () => {
		// 2.000 de 50.000 = 4%: sobre el 2,5% normal del tramo largo, bajo su 5% crítico.
		const check = validateStageReport({ hours: 6, mermaSheets: 2_000 }, { enteredSheets: 50_000 });
		expect(check.ok).toBe(true);
		expect(check.warnings.length).toBeGreaterThan(0);
	});

	it('sin pliegos entrados la compuerta de merma no corre', () => {
		const check = validateStageReport({ hours: 6, mermaSheets: 5_000 });
		expect(check.ok).toBe(true);
	});

	it('una merma imposible se rechaza aunque no haya horas', () => {
		// La pasada abierta es válida; el dato imposible no lo es nunca.
		const check = validateStageReport({ hours: null, mermaSheets: -3 });
		expect(check.ok).toBe(false);
		expect(check.open).toBe(true);
	});

	it('el arreglo de un tiraje corto no dispara nada', () => {
		// 80 de 900 pliegos = 8,9%: dentro del 10% normal del tramo corto, donde el
		// arreglo pesa. El mismo 8,9% en un tiraje largo sería crítico.
		const check = validateStageReport({ hours: 2, mermaSheets: 80 }, { enteredSheets: 900 });
		expect(check.ok).toBe(true);
		expect(check.warnings).toEqual([]);
	});
});

describe('validateStageReport — desvío contra lo estimado', () => {
	it('avisa cuando lo real dobla lo estimado, sin bloquear', () => {
		const check = validateStageReport({ hours: 8 }, { estimatedHours: 4 });
		expect(check.ok).toBe(true);
		expect(check.warnings.some((w) => w.includes('por encima'))).toBe(true);
	});

	it('avisa también cuando tomó mucho menos', () => {
		const check = validateStageReport({ hours: 1 }, { estimatedHours: 4 });
		expect(check.warnings.some((w) => w.includes('por debajo'))).toBe(true);
	});

	it('un desvío chico no dice nada', () => {
		expect(validateStageReport({ hours: 4.5 }, { estimatedHours: 4 }).warnings).toEqual([]);
	});
});

describe('estimatedHoursFor', () => {
	const ot = { calc_print_hours: 6, calc_finish_hours: 2 };

	it('toma las horas de impresión en las prensas', () => {
		expect(estimatedHoursFor('offset_printing', ot)).toBe(6);
		expect(estimatedHoursFor('digital_printing', ot)).toBe(6);
	});

	it('toma las de terminación en el resto del taller', () => {
		expect(estimatedHoursFor('die_cutting', ot)).toBe(2);
		expect(estimatedHoursFor('workshop', ot)).toBe(2);
	});

	it('devuelve null cuando el motor no calculó nada', () => {
		expect(estimatedHoursFor('offset_printing', { calc_print_hours: null })).toBeNull();
		expect(estimatedHoursFor('die_cutting', { calc_finish_hours: 0 })).toBeNull();
	});
});

describe('openPassesMessage', () => {
	const label = (s: string) => ({
		die_cutting: 'Troquelado',
		guillotine_final_cut: 'Corte Final',
		in_delivery: 'En Despacho',
	}[s] ?? s);

	it('sin pasadas abiertas no dice nada', () => {
		expect(openPassesMessage([], label)).toBeNull();
	});

	it('nombra la etapa, no dice «faltan datos»', () => {
		const m = openPassesMessage([{ workflow_step: 'die_cutting' }], label);
		expect(m).toContain('Troquelado');
		expect(m).toContain('la pasada por');
	});

	it('cuenta y lista cuando son varias', () => {
		const m = openPassesMessage(
			[{ workflow_step: 'die_cutting' }, { workflow_step: 'guillotine_final_cut' }],
			label,
		);
		expect(m).toContain('2 pasadas');
		expect(m).toContain('Troquelado, Corte Final');
	});

	it('una etapa con dos pasadas abiertas se nombra una vez', () => {
		// Un avance parcial deja dos pasadas por el mismo troquel. Lo accionable
		// es «andá a cerrar el troquelado», no cuántas veces se pasó por él.
		const m = openPassesMessage(
			[{ workflow_step: 'die_cutting' }, { workflow_step: 'die_cutting' }],
			label,
		);
		expect(m).toContain('la pasada por Troquelado');
		expect(m).not.toContain('2 pasadas');
	});

	it('ofrece las dos puertas para cerrarla', () => {
		const m = openPassesMessage([{ workflow_step: 'in_delivery' }], label);
		expect(m).toContain('tablero');
		expect(m).toContain('WhatsApp');
	});
});
