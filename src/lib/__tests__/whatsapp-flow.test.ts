import { describe, expect, it } from 'vitest';
import {
	CONFIANZA_PARA_APLICAR_SOLO,
	appliesWithoutReview,
	resolveCutStage,
	resolveFlow,
	stagesMentioned,
} from '@/lib/whatsapp-flow';
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser';

const fin = (extra: Record<string, unknown> = {}) => ({
	message_type: 'end',
	confidence: 80,
	...extra,
});

describe('resolveCutStage — «corte» significa dos cosas', () => {
	it('antes de imprimir es el primer corte', () => {
		expect(resolveCutStage('in_storage')).toBe('guillotine_first_cut');
		expect(resolveCutStage('paper_purchase')).toBe('guillotine_first_cut');
		expect(resolveCutStage('guillotine_first_cut')).toBe('guillotine_first_cut');
	});

	it('después del troquel es el corte final', () => {
		expect(resolveCutStage('die_cutting')).toBe('guillotine_final_cut');
		expect(resolveCutStage('guillotine_final_cut')).toBe('guillotine_final_cut');
	});

	// Pedirle al operario que distinga «corte inicial» de «corte final» es
	// pedirle que aprenda el vocabulario del software.
	it('imprimiendo, lo que viene es el corte final', () => {
		expect(resolveCutStage('offset_printing')).toBe('guillotine_final_cut');
	});
});

describe('stagesMentioned — el vocabulario cubre todo el taller', () => {
	it('traduce las prensas y el troquel', () => {
		expect(stagesMentioned(['impresion_offset'], 'in_storage')).toEqual(['offset_printing']);
		expect(stagesMentioned(['impresion_digital'], 'in_storage')).toEqual(['digital_printing']);
		expect(stagesMentioned(['troquelado'], 'offset_printing')).toEqual(['die_cutting']);
	});

	it('todo lo del mesón es Taller', () => {
		for (const p of ['doblado', 'pegado', 'corchetes', 'empaque', 'barniz', 'laminado']) {
			expect(stagesMentioned([p], 'guillotine_final_cut'), p).toEqual(['workshop']);
		}
	});

	it('revisión, entrega y tercerizado también', () => {
		expect(stagesMentioned(['revision'], 'workshop')).toEqual(['workshop_revision']);
		expect(stagesMentioned(['entrega'], 'ready_for_delivery')).toEqual(['in_delivery']);
		expect(stagesMentioned(['entregado'], 'in_delivery')).toEqual(['completed']);
		expect(stagesMentioned(['tercerizado'], 'guillotine_final_cut')).toEqual(['outsourced']);
	});

	it('no repite una etapa nombrada dos veces', () => {
		expect(stagesMentioned(['doblado', 'pegado'], 'workshop')).toEqual(['workshop']);
	});

	it('ignora lo que no sabe traducir', () => {
		expect(stagesMentioned(['algo_raro'], 'workshop')).toEqual([]);
	});
});

describe('resolveFlow — qué pasada cierra', () => {
	it('cierra la etapa donde ESTÁ la OT, no la que el texto nombra', () => {
		// Un mensaje mal tipeado no debe cargar horas en la etapa equivocada: una
		// hora en el lugar que no es, es peor que no tenerla.
		const f = resolveFlow('die_cutting', fin({ processes_mentioned: ['impresion_offset'] }));
		expect(f.closeStage).toBe('die_cutting');
	});

	it('un parte de inicio no cierra ni mueve nada', () => {
		const f = resolveFlow('offset_printing', { message_type: 'start', confidence: 90 });
		expect(f.closeStage).toBeNull();
		expect(f.nextStatus).toBeNull();
	});

	it('en una etapa sin pasada no cierra nada', () => {
		expect(resolveFlow('in_storage', fin()).closeStage).toBeNull();
		expect(resolveFlow('outsourced', fin()).closeStage).toBeNull();
	});

	it('el reparto cierra pasada como cualquier máquina', () => {
		const f = resolveFlow('in_delivery', fin({ hours_reported: 3 }));
		expect(f.closeStage).toBe('in_delivery');
		expect(f.hours).toBe(3);
	});
});

describe('resolveFlow — a dónde va la OT', () => {
	it('sin bifurcación avanza solo', () => {
		expect(resolveFlow('offset_printing', fin()).nextStatus).toBe('die_cutting');
		expect(resolveFlow('die_cutting', fin()).nextStatus).toBe('guillotine_final_cut');
		expect(resolveFlow('workshop', fin()).nextStatus).toBe('workshop_revision');
	});

	it('con bifurcación y sin pista, no elige', () => {
		// Del primer corte se sale a offset o a digital, y eso es una decisión.
		const f = resolveFlow('guillotine_first_cut', fin());
		expect(f.nextStatus).toBeNull();
		expect(f.reason).toContain('no dice a cuál');
	});

	it('con bifurcación y una pista, elige lo que el parte nombra', () => {
		const f = resolveFlow('guillotine_first_cut', fin({ processes_mentioned: ['impresion_digital'] }));
		expect(f.nextStatus).toBe('digital_printing');
	});

	it('el proceso que se acaba de terminar no se toma como destino', () => {
		// «listo el troquelado» estando en el troquel nombra lo terminado, no lo
		// que viene: `die_cutting` no está entre los pasos siguientes.
		const f = resolveFlow('die_cutting', fin({ processes_mentioned: ['troquelado'] }));
		expect(f.nextStatus).toBe('guillotine_final_cut');
	});

	it('del corte final elige taller cuando el parte lo nombra', () => {
		expect(resolveFlow('guillotine_final_cut', fin({ processes_mentioned: ['pegado'] })).nextStatus)
			.toBe('workshop');
		expect(resolveFlow('guillotine_final_cut', fin({ processes_mentioned: ['tercerizado'] })).nextStatus)
			.toBe('outsourced');
	});
});

describe('resolveFlow — lo que trae el parte', () => {
	it('lleva horas, merma y problemas a sus columnas', () => {
		const f = resolveFlow('offset_printing', fin({
			hours_reported: 6,
			merma: 300,
			problems_reported: ['se atascó', 'papel ondulado'],
			unparsed_notes: ', 7600 pliegos, 6 horas',
		}));
		expect(f.hours).toBe(6);
		expect(f.mermaSheets).toBe(300);
		expect(f.issues).toBe('se atascó; papel ondulado');
		// `unparsed_notes` es el resto del mensaje, no una observación: son los
		// mismos números que ya viajan en sus columnas.
		expect(f.observations).toBeNull();
	});

	it('una merma de cero es un dato, no un vacío', () => {
		expect(resolveFlow('offset_printing', fin({ merma: 0 })).mermaSheets).toBe(0);
	});

	it('sin horas la pasada se cierra igual, abierta', () => {
		const f = resolveFlow('offset_printing', fin());
		expect(f.closeStage).toBe('offset_printing');
		expect(f.hours).toBeNull();
	});
});

describe('appliesWithoutReview', () => {
	it('aplica sola por encima del umbral', () => {
		expect(appliesWithoutReview(resolveFlow('workshop', fin({ confidence: 90 })))).toBe(true);
	});

	it('manda a revisión lo dudoso: adivinar horas es peor que no tenerlas', () => {
		expect(appliesWithoutReview(resolveFlow('workshop', fin({ confidence: 40 })))).toBe(false);
	});

	it('el umbral es inclusivo', () => {
		const f = resolveFlow('workshop', fin({ confidence: CONFIANZA_PARA_APLICAR_SOLO }));
		expect(appliesWithoutReview(f)).toBe(true);
	});
});

/* ─── De punta a punta: el mensaje real del taller ─────────────────── */

describe('el parte que manda el taller, entero', () => {
	it('el del prensista cierra la prensa y entra al troquel', () => {
		const { production_data, message_type } = parseWhatsAppMessage('Fin OT 40879, 7600 pliegos, 300 de merma, 6 horas');
		const f = resolveFlow('offset_printing', { ...production_data!, message_type });
		expect(f.closeStage).toBe('offset_printing');
		expect(f.nextStatus).toBe('die_cutting');
		expect(f.hours).toBe(6);
		expect(f.mermaSheets).toBe(300);
	});

	it('el del que revisa', () => {
		const { production_data, message_type } = parseWhatsAppMessage('OT 40879 revisada, 2 horas, todo ok');
		const f = resolveFlow('workshop_revision', { ...production_data!, message_type });
		expect(f.closeStage).toBe('workshop_revision');
		expect(f.nextStatus).toBe('ready_for_delivery');
		expect(f.hours).toBe(2);
	});

	it('el del que reparte cierra el recorrido', () => {
		const { production_data, message_type } = parseWhatsAppMessage('OT 40879 entregada, 3 horas');
		const f = resolveFlow('in_delivery', { ...production_data!, message_type });
		expect(f.closeStage).toBe('in_delivery');
		expect(f.nextStatus).toBe('completed');
		expect(f.hours).toBe(3);
	});

	it('el del que trabaja en el mesón', () => {
		const { production_data, message_type } = parseWhatsAppMessage('listo OT 40879, doblado y pegado, 4 hrs');
		const f = resolveFlow('workshop', { ...production_data!, message_type });
		expect(f.closeStage).toBe('workshop');
		expect(f.nextStatus).toBe('workshop_revision');
		expect(f.hours).toBe(4);
	});

	it('el del guillotinista, con la ambigüedad resuelta por posición', () => {
		const { production_data, message_type } = parseWhatsAppMessage('fin OT 40879 corte listo 3 horas');
		const antes = resolveFlow('guillotine_first_cut', { ...production_data!, message_type });
		expect(antes.closeStage).toBe('guillotine_first_cut');
		const despues = resolveFlow('guillotine_final_cut', { ...production_data!, message_type });
		expect(despues.closeStage).toBe('guillotine_final_cut');
	});
});
