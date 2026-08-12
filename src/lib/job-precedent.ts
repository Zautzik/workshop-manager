/**
 * El precedente: cómo empieza de verdad un trabajo en una imprenta.
 *
 * El mejor estimador de un taller no es una fórmula, es lo que se cobró la vez
 * pasada. «¿Qué le hicimos a Viña Coirón por esta misma etiqueta?» gana
 * cualquier discusión, porque el precedente incluye todo lo que el modelo no
 * sabe: que ese cliente pide prueba de color, que ese troquel ya existe, que esa
 * cartulina llega en tres semanas.
 *
 * Por eso la primera pregunta de los dos asistentes —el del vendedor y el de
 * producción— es la misma: **¿es una repetición?** La mayoría de los trabajos de
 * una imprenta lo son.
 *
 * ── Lo que se copia y lo que no ─────────────────────────────────────────────
 *
 * Se copia **el trabajo**: medidas, sustrato, gramaje, colores, cobertura,
 * terminaciones. Eso no cambia entre una corrida y la siguiente.
 *
 * NO se copia **el precio**. Se recalcula con las tarifas de hoy. El papel de
 * hace ocho meses no vale lo de hoy, y arrastrar un precio viejo es exactamente
 * cómo se repite un error de cotización durante dos años.
 *
 * Lo que sí se muestra es la DERIVA: cuánto se cobró entonces, cuánto da el
 * motor ahora, y en qué dirección. Es la conversación que el vendedor necesita
 * tener antes de llamar — «la misma etiqueta le sale 18% más que en marzo,
 * porque la cartulina subió» — en vez de descubrirlo cuando el cliente reclama.
 */

/** Un trabajo pasado, con lo mínimo que sirve como precedente. */
export interface PastJob {
	id: string;
	ot_number: string;
	client_name: string | null;
	client_id: string | null;
	product_name: string | null;
	product_type: string | null;
	quantity: number;
	width_cm: number | null;
	height_cm: number | null;
	substrate_type: string | null;
	grammage_gsm: number | null;
	color_front: string | null;
	color_back: string | null;
	ink_coverage: string | null;
	total_price: number | null;
	created_at: string;
}

/** Las especificaciones que se heredan. Neutral: no es el formulario de nadie. */
export interface PrecedentSpec {
	client_id: string;
	client_name: string;
	product_name: string;
	product_type: string;
	quantity: number;
	width_cm: number;
	height_cm: number;
	substrate_type: string;
	grammage_gsm: number;
	colors_front: number;
	colors_back: number;
	ink_coverage: 'light' | 'medium' | 'heavy';
	ot_anterior: string;
}

const COLORS_BY_MODE: Record<string, number> = {
	sin_impresion: 0, '1_color': 1, '2_color': 2, '3_color': 3, cmyk: 4, cmyk_pantone: 5,
};

/** Un trabajo sin medidas o sin cantidad no sirve de precedente para nada. */
export function isUsable(job: PastJob): boolean {
	return Boolean(job.width_cm && job.height_cm && Number(job.quantity) > 0);
}

/**
 * Busca por cliente, producto o número de OT.
 *
 * Sin término no devuelve nada — a propósito. Mostrar «los últimos seis» invita
 * a elegir el primero que aparece, y el precedente equivocado es peor que
 * ninguno: arrastra medidas de otro trabajo a una cotización que se ve bien.
 */
export function matchJobs(all: readonly PastJob[], term: string, limit = 6): PastJob[] {
	const q = term.trim().toLowerCase();
	if (!q) return [];

	return all
		.filter(isUsable)
		.filter(
			(o) =>
				(o.client_name ?? '').toLowerCase().includes(q) ||
				(o.product_name ?? '').toLowerCase().includes(q) ||
				String(o.ot_number).toLowerCase().includes(q),
		)
		// El más reciente primero: si un cliente repite, la última corrida es la
		// que tiene las correcciones que se le fueron haciendo al trabajo.
		.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
		.slice(0, limit);
}

/** Traduce un trabajo pasado a especificaciones heredables. */
export function specFrom(job: PastJob): PrecedentSpec {
	const cobertura = job.ink_coverage;
	return {
		client_id: job.client_id ?? '',
		client_name: job.client_name ?? '',
		product_name: job.product_name ?? '',
		product_type: job.product_type ?? 'otro',
		quantity: Number(job.quantity) || 0,
		width_cm: Number(job.width_cm) || 0,
		height_cm: Number(job.height_cm) || 0,
		substrate_type: job.substrate_type ?? 'couche',
		grammage_gsm: Number(job.grammage_gsm) || 0,
		colors_front: COLORS_BY_MODE[job.color_front ?? ''] ?? 4,
		colors_back: COLORS_BY_MODE[job.color_back ?? ''] ?? 0,
		ink_coverage: cobertura === 'light' || cobertura === 'heavy' ? cobertura : 'medium',
		ot_anterior: job.ot_number,
	};
}

export interface PriceDrift {
	/** Variación sobre el precio de entonces, como fracción. `null` si no hay con qué comparar. */
	pct: number | null;
	direction: 'sube' | 'baja' | 'igual' | 'sin_datos';
	/** En el idioma del vendedor, listo para leer por teléfono. */
	note: string | null;
}

/** Umbral bajo el cual la diferencia no vale la pena mencionarla. */
const RUIDO = 0.02;

/**
 * Cuánto cambió el precio del mismo trabajo, y en qué dirección.
 *
 * Se compara por UNIDAD, no por total: el cliente casi nunca repite la misma
 * cantidad, y comparar $6 millones contra $9 millones cuando uno es de 100.000
 * y el otro de 150.000 no dice nada.
 */
export function priceDrift(args: {
	pastTotal: number | null | undefined;
	pastQuantity: number | null | undefined;
	nowTotal: number | null | undefined;
	nowQuantity: number | null | undefined;
}): PriceDrift {
	const pu = (t: unknown, q: unknown) => {
		const total = Number(t);
		const cant = Number(q);
		return Number.isFinite(total) && total > 0 && Number.isFinite(cant) && cant > 0
			? total / cant
			: null;
	};

	const antes = pu(args.pastTotal, args.pastQuantity);
	const ahora = pu(args.nowTotal, args.nowQuantity);

	if (antes === null || ahora === null) {
		return {
			pct: null,
			direction: 'sin_datos',
			note: 'El trabajo anterior no tiene precio cargado, así que no hay con qué comparar.',
		};
	}

	const pct = (ahora - antes) / antes;
	if (Math.abs(pct) < RUIDO) {
		return { pct, direction: 'igual', note: 'Prácticamente el mismo precio por unidad que la vez pasada.' };
	}

	const magnitud = `${Math.abs(Math.round(pct * 1000) / 10)}%`;
	return {
		pct,
		direction: pct > 0 ? 'sube' : 'baja',
		note:
			pct > 0
				? `Por unidad sale ${magnitud} más caro que la vez pasada. Conviene tener el motivo a mano antes de llamar.`
				: `Por unidad sale ${magnitud} más barato que la vez pasada.`,
	};
}
