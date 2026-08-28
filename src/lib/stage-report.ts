/**
 * El cierre de una etapa de taller: cuánto tomó y qué pasó.
 *
 * Una OT que sale de la guillotina, de la prensa o del troquel deja hoy un
 * rastro de UBICACIÓN —cambió de columna en el Kanban— y nada más. Cuánto tomó
 * el trabajo, cuántos pliegos se arruinaron y qué se rompió a mitad de tiraje
 * se quedaban en la cabeza del operario y en la memoria del jefe de taller.
 *
 * Eso tiene tres consecuencias que se pagan en plata:
 *
 *   · El costo de la hora-máquina existe (`machine-economics`) y no tiene a qué
 *     multiplicarse. El costeo real de la OT queda cojo: se cargan materiales y
 *     tercerizados, y el tiempo —el recurso más caro y el único que no se puede
 *     recomprar— no entra.
 *   · La merma se sabe medir (`merma`) contra un número que nadie declara por
 *     etapa, así que cuando el margen aparece bajo no se puede decir DÓNDE se
 *     perdió.
 *   · El próximo presupuesto se estima con el mismo número de siempre, porque
 *     no hay historia real contra la cual corregirlo.
 *
 * Este módulo decide DÓNDE se pide el cierre, QUÉ hace que un cierre sea válido
 * y CUÁNDO su ausencia empieza a importar. Es puro —sin I/O— para que la regla
 * se pueda probar y para que la compartan la compuerta del servidor y el
 * formulario del tablero: una sola definición, no dos que se van separando.
 *
 * ── Pedir no es exigir ──────────────────────────────────────────────────────
 *
 * El cierre se PIDE al mover la tarjeta y no se EXIGE nunca para moverla. Una
 * tarjeta que no se mueve no hace que alguien cargue el dato: hace que el
 * trabajo se mueva por fuera del sistema, que es la única forma de perderlo del
 * todo. Sin horas, la pasada queda ABIERTA y se ve; la exigencia vive al final
 * del recorrido, donde una OT no se despacha con pasadas sin cerrar.
 *
 * Eso además es lo que vuelve legítimas a las otras puertas: el papel se
 * declara en el escáner, junto a la máquina; las horas llegan por WhatsApp
 * desde el teléfono del operario. Si el tablero bloqueara, esas puertas serían
 * formas de esquivar un muro en vez de el lugar natural para responder.
 */

import { evaluateMerma } from '@/lib/merma';

/**
 * Las etapas que se cierran declarando cuánto tomaron.
 *
 * Son las que alguien de esta casa ejecuta y cronometra: las siete del taller y
 * el reparto. `in_delivery` entró después y por la misma razón que las otras —
 * el reparto dura, se complica y quien lo sabe lo sabe en el momento:
 * «entregado, 3 horas, el cliente no tenía quien recibiera» es el mismo parte
 * que manda el prensista.
 *
 * Quedan afuera, y por motivos distintos:
 *
 *   · `pre_press` y `visto_bueno` — es diseño y es la espera del cliente. Las
 *     horas de un diseñador no son horas de máquina, y lo que el cliente tarda
 *     en contestar no es tiempo de taller: eso se mide solo, por fecha.
 *   · `paper_purchase` e `in_storage` — conseguir y guardar. Lo que importa ahí
 *     es si llegó y de qué lote salió, no cuántas horas tomó; eso ya lo llevan
 *     los requisitos y los lotes.
 *   · `outsourced` — el trabajo lo hizo un tercero. Preguntar «cuántas horas»
 *     invita a inventar un número: lo que se sabe es cuándo se mandó y cuándo
 *     volvió, y eso lo dan las fechas de la transición. Lo que costó viene en
 *     su factura, no de un reloj nuestro.
 *   · `ready_for_delivery` en adelante — despacho, no producción.
 */
export const ETAPAS_CON_CIERRE: readonly string[] = [
	'guillotine_first_cut',
	'offset_printing',
	'digital_printing',
	'die_cutting',
	'guillotine_final_cut',
	'workshop',
	'workshop_revision',
	'in_delivery',
];

/**
 * ¿Salir de esta etapa abre una pasada?
 *
 * Se llama `prompts` y no `requires` porque eso es exactamente lo que hace:
 * pedir. Salir sin contestar está permitido —la pasada queda abierta— y quien
 * la cierre puede ser otra persona, más tarde y por otra puerta.
 */
export function promptsStageReport(fromStatus: string): boolean {
	return ETAPAS_CON_CIERRE.includes(fromStatus);
}

/**
 * Las etapas donde la OT ya no está produciendo: acá se cobra lo que falte.
 *
 * Es el otro extremo de la misma regla. Mover es libre; despachar y terminar
 * no, porque después de esto la OT deja de estar en la mano de nadie y el dato
 * que falte no va a llegar nunca.
 */
export const ETAPAS_DE_SALIDA: readonly string[] = [
	'ready_for_delivery',
	'in_delivery',
	'completed',
];

/**
 * Tope de horas para una sola pasada por una etapa.
 *
 * No es una regla de negocio: es un cazador de tipeos. El error real y frecuente
 * es escribir MINUTOS en el campo de horas —«480» por ocho horas—, y un 480 que
 * entra en silencio contamina el costo de la OT y el promedio histórico de la
 * máquina. Tres turnos por cinco días son 120 h; 400 deja lugar de sobra para un
 * trabajo que se arrastró dos semanas y sigue atajando el 480.
 */
export const MAX_HORAS_POR_ETAPA = 400;

/** Más de un día corrido de máquina no es imposible, pero merece una repregunta. */
const HORAS_QUE_LLAMAN_LA_ATENCION = 24;

export interface StageReportInput {
	/**
	 * Horas que tomó la etapa que se está cerrando.
	 *
	 * `null` es una respuesta válida y frecuente: significa «pasó por acá y
	 * todavía no sé cuánto tomó». La pasada queda abierta y alguien la cierra
	 * después, desde donde le quede cómodo.
	 */
	hours: number | null;
	/** Pliegos que entraron a la máquina y no salieron vendibles. */
	mermaSheets?: number | null;
	/** Qué pasó con el material perdido. */
	wasteNotes?: string | null;
	/** Lo que se rompió, se atascó o se tuvo que rehacer. */
	issues?: string | null;
	/** Cualquier otra cosa que valga la pena dejar escrita. */
	observations?: string | null;
}

export interface StageReportContext {
	/**
	 * Pliegos que entraron al trabajo, si se saben. Sin esto la merma no se
	 * puede juzgar —no hay contra qué dividir— y su compuerta no corre.
	 */
	enteredSheets?: number | null;
	/** Horas estimadas para la etapa, si el motor las calculó. */
	estimatedHours?: number | null;
}

export interface StageReportProblem {
	field: 'hours' | 'mermaSheets' | 'wasteNotes';
	message: string;
}

export interface StageReportCheck {
	ok: boolean;
	/** No se declararon horas: la pasada se guarda abierta. */
	open: boolean;
	/** Lo que impide guardar. */
	problems: StageReportProblem[];
	/**
	 * Lo que no impide guardar pero conviene mirar antes de confirmar. Se
	 * muestran; no bloquean. Un aviso que bloquea deja de leerse y se esquiva.
	 */
	warnings: string[];
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const hasText = (v: string | null | undefined): boolean => (v ?? '').trim().length > 0;

/**
 * ¿Este cierre se puede guardar?
 *
 * No exige nada: una pasada sin horas es válida y se guarda abierta. Lo que sí
 * rechaza es un dato IMPOSIBLE —480 horas, merma negativa, más pliegos perdidos
 * que entrados—, porque un número equivocado es peor que un campo vacío: el
 * vacío se ve y se puede completar, el equivocado entra al costo de la OT y al
 * promedio histórico de la máquina sin que nadie sospeche.
 *
 * Duro con lo imposible, blando con lo ausente.
 */
export function validateStageReport(
	input: StageReportInput,
	ctx: StageReportContext = {},
): StageReportCheck {
	const problems: StageReportProblem[] = [];
	const warnings: string[] = [];

	// Sin horas la pasada queda abierta. No es un problema: es un estado, y el
	// que lo cobra es la compuerta de salida, no ésta.
	const open = input.hours == null;

	if (!open && (!isNumber(input.hours) || input.hours <= 0)) {
		problems.push({
			field: 'hours',
			message: 'Las horas tienen que ser un número mayor que cero. Dejalo vacío si todavía no lo sabés.',
		});
	} else if (isNumber(input.hours) && input.hours > MAX_HORAS_POR_ETAPA) {
		problems.push({
			field: 'hours',
			message:
				`${input.hours} h para una sola etapa no es creíble (el tope es ` +
				`${MAX_HORAS_POR_ETAPA} h). Si escribiste minutos, dividí por 60.`,
		});
	} else if (isNumber(input.hours) && input.hours > HORAS_QUE_LLAMAN_LA_ATENCION) {
		warnings.push(
			`${input.hours} h es más de un día corrido de máquina. Si son minutos, dividí por 60.`,
		);
	}

	const merma = input.mermaSheets;
	if (merma != null) {
		if (!isNumber(merma) || merma < 0) {
			problems.push({ field: 'mermaSheets', message: 'La merma no puede ser negativa.' });
		} else if (isNumber(ctx.enteredSheets) && ctx.enteredSheets > 0 && merma > ctx.enteredSheets) {
			problems.push({
				field: 'mermaSheets',
				message:
					`No pueden perderse ${merma.toLocaleString('es-CL')} pliegos si al trabajo ` +
					`entraron ${ctx.enteredSheets.toLocaleString('es-CL')}.`,
			});
		}
	}

	// ── Una merma crítica sin explicación no sirve para corregir nada ────────
	//
	// Es el único texto que se vuelve obligatorio, y sólo en el caso extremo. El
	// número dice cuánto se perdió; para que alguien pueda evitarlo la próxima
	// vez hace falta saber si fue el papel, el registro o la máquina. Sin
	// pliegos entrados la compuerta no corre: no se puede llamar crítica a una
	// tasa que no se puede calcular.
	if (
		isNumber(merma) && merma > 0 &&
		isNumber(ctx.enteredSheets) && ctx.enteredSheets > 0 &&
		!hasText(input.wasteNotes)
	) {
		const verdict = evaluateMerma({ merma, pliegos: ctx.enteredSheets });
		if (verdict.level === 'critica') {
			problems.push({
				field: 'wasteNotes',
				message: `${verdict.note} Escribí qué pasó antes de cerrar la etapa.`,
			});
		} else if (verdict.level === 'alta' && verdict.note) {
			warnings.push(verdict.note);
		}
	}

	// El desvío contra lo estimado se avisa, nunca bloquea: lo estimado es una
	// predicción y lo real es un hecho. Cuando chocan, el que está mal es el
	// estimado — y este aviso es justamente el que lo corrige para la próxima.
	if (
		isNumber(input.hours) && input.hours > 0 &&
		isNumber(ctx.estimatedHours) && ctx.estimatedHours > 0
	) {
		const dev = (input.hours - ctx.estimatedHours) / ctx.estimatedHours;
		if (Math.abs(dev) >= 0.5) {
			const pct = Math.round(Math.abs(dev) * 100);
			warnings.push(
				dev > 0
					? `${pct}% por encima de las ${ctx.estimatedHours} h estimadas para esta etapa.`
					: `${pct}% por debajo de las ${ctx.estimatedHours} h estimadas para esta etapa.`,
			);
		}
	}

	return { ok: problems.length === 0, open, problems, warnings };
}

/** El primer motivo por el que un cierre no se puede guardar, para un toast. */
export function firstProblem(check: StageReportCheck): string | null {
	return check.problems[0]?.message ?? null;
}

/** Una pasada que la OT dejó atrás sin declarar cuánto tomó. */
export interface OpenPass {
	workflow_step: string;
	created_at?: string | null;
}

/**
 * Lo que hay que decirle a quien intenta despachar una OT con pasadas abiertas.
 *
 * Devuelve `null` cuando no hay nada que cobrar. El mensaje NOMBRA las etapas:
 * «faltan datos» obliga a ir a buscar cuáles, y quien está despachando no tiene
 * por qué saber por dónde pasó el trabajo la semana pasada.
 *
 * Nombra cada etapa UNA vez aunque tenga varias pasadas abiertas —un avance
 * parcial deja dos pasadas por el mismo troquel— porque lo accionable es
 * «andá a cerrar el troquelado», no cuántas veces se pasó por él.
 *
 * Recibe el traductor de etiquetas en vez de importarlo: este módulo lo comparte
 * el servidor con el navegador, y una dependencia hacia la capa de presentación
 * lo ataría a una de las dos.
 */
export function openPassesMessage(
	passes: readonly OpenPass[],
	label: (stage: string) => string,
): string | null {
	if (passes.length === 0) return null;

	const etapas = [...new Set(passes.map((p) => p.workflow_step))].map(label);
	const cuantas =
		etapas.length === 1
			? `la pasada por ${etapas[0]}`
			: `${etapas.length} pasadas: ${etapas.join(', ')}`;

	return (
		`No se puede despachar con ${cuantas} sin cerrar. ` +
		'Falta decir cuántas horas tomó — se puede desde el tablero, o el operario ' +
		'lo manda por WhatsApp.'
	);
}

/**
 * Las horas estimadas que le corresponden a una etapa.
 *
 * El motor guarda dos números en la OT —`calc_print_hours` y
 * `calc_finish_hours`— y no uno por etapa. Repartirlos entre las etapas que los
 * componen sería inventar precisión; lo honesto es mostrar el número del bloque
 * al que la etapa pertenece y decir que es del bloque. Sirve igual para lo
 * único que se le pide: que 40 h escritas donde se esperaban 4 salten a la vista.
 */
export function estimatedHoursFor(
	stage: string,
	ot: { calc_print_hours?: number | null; calc_finish_hours?: number | null },
): number | null {
	const printing = ['offset_printing', 'digital_printing'];
	const value = printing.includes(stage) ? ot.calc_print_hours : ot.calc_finish_hours;
	return isNumber(value) && value > 0 ? value : null;
}
