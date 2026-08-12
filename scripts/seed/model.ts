/**
 * El taller que la demo describe.
 *
 * Este archivo es PURO: no toca la base, no lee el reloj, no usa Math.random.
 * Recibe la planta (máquinas, gente, tarifas) y devuelve trabajos completos.
 * Todo lo que escribe el sembrador sale de acá, y por eso se puede probar.
 *
 * ── La regla que ordena todo ────────────────────────────────────────────────
 *
 * Ninguna cifra se inventa dos veces. Los pliegos, las horas y el costo
 * estimado los calcula el MISMO motor que usa el asistente de cotización
 * (`computeOTCalculations` → `generateDefaultOperations` → `computeOTPricing`).
 * El costo real no se sortea: sale de lo que efectivamente pasó —los pliegos
 * que entraron a máquina, las horas que la gente marcó, el precio del lote que
 * se consumió— y es la suma de esos hechos.
 *
 * Es la diferencia entre una demo que se ve bien y una que resiste que le
 * abran una OT: acá los números de la pantalla de rentabilidad se pueden
 * reconstruir desde las capturas del taller, porque de ahí vienen.
 *
 * ── La escala ───────────────────────────────────────────────────────────────
 *
 * El objetivo es un margen bruto de $300.000.000 al mes —precio de venta menos
 * costo real, que es lo que la vista `ot_cost_summary` llama `gross_margin`.
 * Con el margen de una imprenta eso son unos $1.350 millones de venta mensual.
 *
 * Contra la flota real —dos Ryobi 524GS de media prensa y una Roland 300— eso
 * son ~2,8 millones de pliegos al mes: dos turnos, y el cuello de botella no es
 * la prensa sino las terminaciones. El sembrador informa la carga que implica
 * en vez de esconderla.
 */

import {
	computeImposition,
	computeOTCalculations,
	generateDefaultOperations,
	computeOTPricing,
	type CostOverrides,
	type InkCoverage,
} from '../../src/lib/ot-calculations';
import { EMPTY_FINISHES, INITIAL_OT_FORM } from '../../src/types/ot';
import type {
	OTCalculations,
	OTColorMode,
	OTFormData,
	OTOperation,
	OTProductType,
	OTSubstrateType,
} from '../../src/types/ot';

/* ─── El objetivo ────────────────────────────────────────────── */

/** Margen bruto mensual: precio de venta menos costo real. */
export const MONTHLY_MARGIN_TARGET_CLP = 300_000_000;

/** Meses que la demo cuenta. El último va en curso. */
export const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08'] as const;
export type MonthKey = (typeof MONTHS)[number];

/* ─── Azar reproducible ──────────────────────────────────────── */

/**
 * mulberry32. Se siembra con una constante, así que dos corridas del sembrador
 * producen exactamente la misma base: si algo se ve raro en la demo, se puede
 * volver a mirar.
 */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/* ─── Lo que el taller vende ─────────────────────────────────── */

export type FinishKey = keyof typeof EMPTY_FINISHES;

export interface ProductLine {
	key: string;
	/** Cómo lo llama el vendedor, no cómo lo llama la base. */
	label: string;
	productType: OTProductType;
	widthCm: number;
	heightCm: number;
	substrate: OTSubstrateType;
	gsm: number;
	colorFront: OTColorMode;
	colorBack: OTColorMode;
	inkCoverage: InkCoverage;
	finishes: FinishKey[];
	/** Tirajes que este producto pide de verdad. */
	runs: [number, number];
	/** Margen comercial de la línea, en el sentido del motor de precios. */
	marginPct: number;
	/** Recargo que la línea suele soportar sobre el margen. */
	incrementPct: number;
	/** Merma esperada sobre lo planificado, como fracción extra de papel. */
	mermaBand: [number, number];
	/** Peso relativo en la carga del taller. */
	weight: number;
	/** Máquina en la que corre. */
	press: 'ryobi' | 'roland';
}

/**
 * El catálogo de una imprenta chilena de packaging: viñas, salmón, fruta y
 * alimento son la demanda real, y el trabajo comercial —volantes, afiches—
 * llena la prensa cuando el packaging afloja.
 *
 * Los márgenes no son parejos a propósito. El estuche de vino deja 32% y el
 * volante 12%: es exactamente el hallazgo que las pantallas de Analítica
 * existen para mostrar, y una demo donde todo deja lo mismo no muestra nada.
 */
export const PRODUCT_LINES: readonly ProductLine[] = [
	{
		key: 'estuche_vino',
		label: 'Estuche de vino con hot stamping',
		productType: 'caja_plegadiza',
		widthCm: 12, heightCm: 34,
		substrate: 'cartulina', gsm: 350,
		colorFront: 'cmyk_pantone', colorBack: 'sin_impresion',
		inkCoverage: 'heavy',
		finishes: ['finish_troquelado', 'finish_plegado', 'finish_pegado', 'finish_hot_stamping', 'finish_relieve'],
		runs: [30_000, 140_000],
		marginPct: 32, incrementPct: 12,
		mermaBand: [0.03, 0.07],
		weight: 16,
		press: 'ryobi',
	},
	{
		key: 'estuche_alimento',
		label: 'Estuche plegadizo para alimento',
		productType: 'caja_plegadiza',
		widthCm: 20, heightCm: 30,
		substrate: 'cartulina', gsm: 300,
		colorFront: 'cmyk', colorBack: 'sin_impresion',
		inkCoverage: 'medium',
		finishes: ['finish_troquelado', 'finish_plegado', 'finish_pegado', 'finish_laminado'],
		runs: [80_000, 320_000],
		marginPct: 21, incrementPct: 10,
		mermaBand: [0.02, 0.05],
		weight: 24,
		press: 'ryobi',
	},
	{
		key: 'caja_display',
		label: 'Caja display de exhibición',
		productType: 'caja_display',
		widthCm: 28, heightCm: 34,
		substrate: 'cartulina', gsm: 400,
		colorFront: 'cmyk', colorBack: 'sin_impresion',
		inkCoverage: 'heavy',
		finishes: ['finish_troquelado', 'finish_plegado', 'finish_uv_localizado'],
		runs: [15_000, 70_000],
		marginPct: 27, incrementPct: 12,
		mermaBand: [0.04, 0.09],
		weight: 11,
		press: 'ryobi',
	},
	{
		key: 'etiqueta_adhesiva',
		label: 'Etiqueta adhesiva troquelada',
		productType: 'etiqueta',
		widthCm: 9, heightCm: 13,
		substrate: 'adhesivo', gsm: 90,
		colorFront: 'cmyk', colorBack: 'sin_impresion',
		inkCoverage: 'medium',
		finishes: ['finish_troquelado', 'finish_barniz'],
		runs: [120_000, 600_000],
		marginPct: 25, incrementPct: 10,
		mermaBand: [0.02, 0.06],
		weight: 15,
		press: 'ryobi',
	},
	{
		key: 'etiqueta_botella',
		label: 'Etiqueta de botella en couché',
		productType: 'etiqueta',
		widthCm: 10, heightCm: 12,
		substrate: 'couche', gsm: 150,
		colorFront: 'cmyk_pantone', colorBack: 'sin_impresion',
		inkCoverage: 'heavy',
		finishes: ['finish_troquelado', 'finish_barniz', 'finish_relieve'],
		runs: [60_000, 350_000],
		marginPct: 29, incrementPct: 11,
		mermaBand: [0.03, 0.07],
		weight: 12,
		press: 'ryobi',
	},
	{
		key: 'folleto',
		label: 'Folleto comercial 4/4',
		productType: 'brochure',
		widthCm: 21, heightCm: 29.7,
		substrate: 'couche', gsm: 115,
		colorFront: 'cmyk', colorBack: 'cmyk',
		inkCoverage: 'medium',
		finishes: ['finish_plegado'],
		runs: [40_000, 200_000],
		marginPct: 13, incrementPct: 8,
		mermaBand: [0.02, 0.05],
		weight: 10,
		press: 'ryobi',
	},
	{
		key: 'afiche',
		label: 'Afiche promocional',
		productType: 'afiche',
		widthCm: 32, heightCm: 45,
		substrate: 'couche', gsm: 150,
		colorFront: 'cmyk', colorBack: 'sin_impresion',
		inkCoverage: 'heavy',
		finishes: [],
		runs: [4_000, 25_000],
		marginPct: 18, incrementPct: 10,
		mermaBand: [0.05, 0.12],
		weight: 5,
		press: 'ryobi',
	},
	{
		key: 'instructivo',
		label: 'Instructivo a un color',
		productType: 'volante',
		widthCm: 14, heightCm: 21,
		substrate: 'bond', gsm: 80,
		colorFront: '1_color', colorBack: '1_color',
		inkCoverage: 'light',
		finishes: ['finish_plegado'],
		runs: [50_000, 250_000],
		marginPct: 11, incrementPct: 7,
		mermaBand: [0.02, 0.05],
		weight: 7,
		press: 'roland',
	},
];

/* ─── A quién le vende ───────────────────────────────────────── */

export interface DemoClient {
	name: string;
	rut: string;
	city: string;
	giro: string;
	paymentTerms: number;
	/** Líneas que este cliente compra. */
	buys: string[];
	/** Peso en la cartera: los cinco primeros hacen la mitad de la venta. */
	weight: number;
	/** Vendedor a cargo, por índice en SALESMEN. */
	salesman: number;
}

/** Los vendedores. Se crean como empleados porque `salesman_id` apunta ahí. */
export const SALESMEN = [
	{ code: 'EMP-101', name: 'Paulina Alcaíno', email: 'palcaino@demo.local', phone: '+56 9 6120 4471' },
	{ code: 'EMP-102', name: 'Rodrigo Villablanca', email: 'rvillablanca@demo.local', phone: '+56 9 6120 4472' },
	{ code: 'EMP-103', name: 'Karin Estévez', email: 'kestevez@demo.local', phone: '+56 9 6120 4473' },
] as const;

/**
 * Cartera inventada, con la forma que tiene una cartera real: cinco cuentas
 * hacen la mitad de la venta y la cola larga hace el resto. Los RUT son de
 * fantasía y los nombres también.
 */
export const CLIENT_BOOK: readonly DemoClient[] = [
	{ name: 'Viña Coirón del Maule', rut: '76.412.880-9', city: 'Talca', giro: 'Elaboración de vinos', paymentTerms: 60, buys: ['estuche_vino', 'etiqueta_botella'], weight: 15, salesman: 0 },
	{ name: 'Alimentos Ñielol', rut: '77.203.114-2', city: 'Temuco', giro: 'Elaboración de alimentos', paymentTerms: 45, buys: ['estuche_alimento', 'caja_display'], weight: 13, salesman: 1 },
	{ name: 'Salmones Chaicura', rut: '76.988.201-K', city: 'Puerto Montt', giro: 'Cultivo y proceso de salmón', paymentTerms: 60, buys: ['estuche_alimento', 'etiqueta_adhesiva'], weight: 10, salesman: 1 },
	{ name: 'Exportadora Frutícola Panul', rut: '76.551.907-4', city: 'Rancagua', giro: 'Exportación de fruta fresca', paymentTerms: 45, buys: ['etiqueta_adhesiva', 'caja_display'], weight: 8, salesman: 2 },
	{ name: 'Laboratorio Quilmahue', rut: '77.640.332-1', city: 'Santiago', giro: 'Productos farmacéuticos', paymentTerms: 30, buys: ['estuche_alimento', 'instructivo'], weight: 7, salesman: 0 },
	{ name: 'Cervecería Manque', rut: '77.115.470-6', city: 'Valdivia', giro: 'Elaboración de cerveza', paymentTerms: 30, buys: ['etiqueta_botella', 'caja_display'], weight: 6, salesman: 0 },
	{ name: 'Cosmética Ilalén', rut: '76.302.559-8', city: 'Santiago', giro: 'Cosméticos y perfumería', paymentTerms: 45, buys: ['estuche_vino', 'caja_display'], weight: 5, salesman: 2 },
	{ name: 'Conservas Litué', rut: '76.774.028-3', city: 'Chillán', giro: 'Conservas de fruta y hortaliza', paymentTerms: 45, buys: ['etiqueta_adhesiva', 'estuche_alimento'], weight: 5, salesman: 1 },
	{ name: 'Retail Aldea Norte', rut: '96.845.112-7', city: 'Antofagasta', giro: 'Comercio al por menor', paymentTerms: 30, buys: ['folleto', 'afiche'], weight: 5, salesman: 2 },
	{ name: 'Distribuidora Panguipulli', rut: '77.089.663-5', city: 'Osorno', giro: 'Distribución mayorista', paymentTerms: 30, buys: ['folleto', 'instructivo'], weight: 4, salesman: 2 },
	{ name: 'Molinos Curalí', rut: '76.198.740-0', city: 'Los Ángeles', giro: 'Molienda de cereales', paymentTerms: 45, buys: ['estuche_alimento'], weight: 4, salesman: 1 },
	{ name: 'Aceites Trumao', rut: '77.556.219-9', city: 'La Unión', giro: 'Elaboración de aceites', paymentTerms: 45, buys: ['etiqueta_botella', 'estuche_alimento'], weight: 3, salesman: 0 },
	{ name: 'Vivero Los Quillayes', rut: '76.663.305-2', city: 'Quillota', giro: 'Vivero y plantas', paymentTerms: 30, buys: ['etiqueta_adhesiva'], weight: 2, salesman: 2 },
	{ name: 'Chocolatería Antuco', rut: '77.312.008-4', city: 'Concepción', giro: 'Elaboración de chocolates', paymentTerms: 30, buys: ['estuche_vino', 'caja_display'], weight: 2, salesman: 0 },
	{ name: 'Clínica Ancoa', rut: '65.480.117-6', city: 'Talca', giro: 'Servicios de salud', paymentTerms: 30, buys: ['instructivo', 'folleto'], weight: 2, salesman: 2 },
	{ name: 'Municipalidad de Rari', rut: '69.140.500-1', city: 'Colbún', giro: 'Administración pública', paymentTerms: 60, buys: ['afiche', 'folleto'], weight: 2, salesman: 2 },
	{ name: 'Textil Curimón', rut: '76.877.454-8', city: 'San Felipe', giro: 'Confección textil', paymentTerms: 30, buys: ['etiqueta_adhesiva'], weight: 2, salesman: 1 },
	{ name: 'Frutos Secos Pichidegua', rut: '77.441.906-3', city: 'San Vicente', giro: 'Proceso de frutos secos', paymentTerms: 45, buys: ['estuche_alimento', 'etiqueta_adhesiva'], weight: 2, salesman: 1 },
	{ name: 'Editorial Ranquil', rut: '76.024.775-5', city: 'Santiago', giro: 'Edición de libros', paymentTerms: 30, buys: ['instructivo', 'folleto'], weight: 2, salesman: 2 },
	{ name: 'Lácteos Colmuyao', rut: '77.702.881-7', city: 'Cauquenes', giro: 'Elaboración de lácteos', paymentTerms: 45, buys: ['estuche_alimento'], weight: 2, salesman: 1 },
	{ name: 'Turismo Huilo Sur', rut: '76.930.244-0', city: 'Pucón', giro: 'Servicios turísticos', paymentTerms: 30, buys: ['folleto', 'afiche'], weight: 1, salesman: 2 },
	{ name: 'Ferretería Malloco', rut: '77.018.552-9', city: 'Peñaflor', giro: 'Comercio de materiales', paymentTerms: 30, buys: ['folleto'], weight: 1, salesman: 2 },
	{ name: 'Apícola Rihue', rut: '76.445.190-6', city: 'Negrete', giro: 'Producción de miel', paymentTerms: 30, buys: ['etiqueta_botella'], weight: 1, salesman: 0 },
	{ name: 'Semillas Peumo Alto', rut: '77.630.417-2', city: 'Graneros', giro: 'Producción de semillas', paymentTerms: 45, buys: ['etiqueta_adhesiva', 'instructivo'], weight: 1, salesman: 1 },
];

/* ─── Lo que se desvía entre la cotización y la realidad ─────── */

/**
 * El costo real nunca es el estimado, y las razones por las que se separa son
 * pocas y conocidas. Modelarlas con nombre —en vez de multiplicar todo por un
 * número al azar— es lo que hace que la pantalla de «Estimado vs Real» diga
 * algo: el jefe de taller reconoce «se fue en merma» y puede ir a mirarlo.
 */
export interface Deviation {
	key: string;
	/** Lo que el sistema muestra como explicación de la diferencia. */
	causa: string;
	/** Papel de más que entró a máquina, sobre la merma ya planificada. */
	papelExtra: number;
	/** Horas de máquina y de gente de más. */
	horasExtra: number;
	/** Trabajo que hubo que mandar afuera, como fracción del costo estimado. */
	tercerizado: number;
	probability: number;
}

export const DEVIATIONS: readonly Deviation[] = [
	{ key: 'limpio', causa: 'El trabajo corrió como se cotizó.', papelExtra: 0.005, horasExtra: 0.02, tercerizado: 0, probability: 0.46 },
	{ key: 'merma_alta', causa: 'Merma sobre lo planificado: el papel llegó con humedad y la prensa perdió registro.', papelExtra: 0.11, horasExtra: 0.08, tercerizado: 0, probability: 0.15 },
	{ key: 'reproceso', causa: 'Reproceso: se reimprimió un pliego por variación de color en el tiraje.', papelExtra: 0.07, horasExtra: 0.28, tercerizado: 0, probability: 0.11 },
	{ key: 'papel_subio', causa: 'El papel subió entre la cotización y la orden de compra.', papelExtra: 0.14, horasExtra: 0.01, tercerizado: 0, probability: 0.09 },
	{ key: 'tercerizado', causa: 'El troquel se envió fuera: la troqueladora estaba comprometida.', papelExtra: 0.02, horasExtra: -0.15, tercerizado: 0.09, probability: 0.08 },
	{ key: 'apuro', causa: 'Se corrió en turno de noche para llegar a la fecha comprometida.', papelExtra: 0.03, horasExtra: 0.22, tercerizado: 0, probability: 0.06 },
	{ key: 'salio_mejor', causa: 'El tiraje corrió sin parar: menos alistamiento del previsto.', papelExtra: -0.02, horasExtra: -0.12, tercerizado: 0, probability: 0.05 },
];

export function drawDeviation(r: () => number): Deviation {
	const x = r();
	let acc = 0;
	for (const d of DEVIATIONS) {
		acc += d.probability;
		if (x <= acc) return d;
	}
	return DEVIATIONS[0];
}

/* ─── La planta, tal como el sembrador la resuelve ───────────── */

export interface PressRef {
	id: string;
	name: string;
	key: 'ryobi' | 'roland';
	bodies: number;
	speedSheetsHr: number;
	maxWidthCm: number;
	maxHeightCm: number;
}

export interface PersonRef {
	id: string;
	name: string;
	/** Tarifa por hora vigente, de `compensation_rates`. */
	hourlyRate: number;
}

export interface Plant {
	presses: PressRef[];
	dieCutterId: string;
	guillotineIds: string[];
	finisherMachineIds: string[];
	crew: {
		press: PersonRef[];
		cut: PersonRef[];
		finish: PersonRef[];
		prepress: PersonRef[];
	};
	/** Tarifas del catálogo de costos, ya resueltas a claves del motor. */
	rates: CostOverrides;
	/** Costo de hora-máquina por prensa: energía + depreciación + mantención. */
	machineHourCost: Record<string, number>;
}

/* ─── Un trabajo completo ────────────────────────────────────── */

export type CostCategory = 'material' | 'labor' | 'machine' | 'finishing' | 'outsourced' | 'overhead' | 'other';

export interface CostLine {
	category: CostCategory;
	description: string;
	quantity: number;
	unit: string;
	unitCost: number;
	total: number;
}

export type CrewPool = 'press' | 'cut' | 'finish' | 'prepress';

export interface CrewShift {
	personId: string;
	personName: string;
	machineId: string;
	role: string;
	/** De qué banca sale la persona. Lo usa el planificador de turnos. */
	pool: CrewPool;
	date: string;
	hours: number;
	cost: number;
}

export interface CaptureMsg {
	/** El texto tal como el operario lo escribiría por WhatsApp. */
	text: string;
	operatorId: string;
	operatorName: string;
	at: string;
	kind: 'start' | 'end';
}

export interface PlannedJob {
	otNumber: string;
	vbNumber: string;
	month: MonthKey;
	client: DemoClient;
	line: ProductLine;
	quantity: number;
	press: PressRef;
	form: OTFormData;
	calcs: OTCalculations;
	operations: OTOperation[];
	pricing: ReturnType<typeof computeOTPricing>;

	/** Fechas del recorrido: cotización, aprobación, producción, entrega. */
	quotedOn: string;
	approvedOn: string;
	startedOn: string;
	finishedOn: string | null;
	deadline: string;

	/** Dónde está hoy. Los meses cerrados terminan; el mes en curso no. */
	status: string;
	closed: boolean;

	estimateLines: CostLine[];
	actualLines: CostLine[];
	deviation: Deviation;

	/** Pliegos que realmente entraron a máquina, y los que se perdieron. */
	sheetsEntered: number;
	sheetsWasted: number;
	pressHours: number;
	finishHours: number;
	/** Las terminaciones se hicieron en un taller externo. */
	finishingOutsourced: boolean;

	crew: CrewShift[];
	captures: CaptureMsg[];

	revenue: number;
	estimatedCost: number;
	actualCost: number;
	grossMargin: number;
}

/* ─── Construcción de un trabajo ─────────────────────────────── */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/**
 * Categoría de la línea de costo a partir de la operación del motor.
 *
 * El respaldo original del ledger mandaba «impresión» entera a `machine`, así
 * que el operador de prensa quedaba contado como máquina y la mano de obra del
 * taller no aparecía nunca en el desglose. Acá el operador es mano de obra,
 * que es lo que dice la boleta.
 */
export function categoryOf(op: OTOperation): CostCategory {
	if (/^Operador/i.test(op.name)) return 'labor';
	switch (op.category) {
		case 'materiales': return 'material';
		case 'impresion': return 'machine';
		case 'terminaciones': return 'finishing';
		case 'tercerizado': return 'outsourced';
		default: return /Gastos Generales/i.test(op.name) ? 'overhead' : 'other';
	}
}

interface BuildArgs {
	otNumber: string;
	vbNumber: string;
	month: MonthKey;
	client: DemoClient;
	line: ProductLine;
	quantity: number;
	plant: Plant;
	quotedOn: Date;
	startedOn: Date;
	/** `null` cuando el trabajo sigue en el taller. */
	finishedOn: Date | null;
	status: string;
	/** Las terminaciones se hacen afuera porque las máquinas propias están tomadas. */
	finishingOutsourced: boolean;
	r: () => number;
}

/**
 * Lo que cobra de más un tercero por hacer el troquelado y el pegado.
 *
 * No es un castigo inventado: el tercero pone su máquina, su gente y su margen.
 * 35% sobre el costo propio es la cifra con que se negocia. Que esté acá y no
 * escondida en un número es lo que permite que la app después diga «este mes se
 * hicieron afuera 4.100 horas y costaron $X de más».
 */
export const OUTSOURCING_PREMIUM = 0.35;

export function buildJob(args: BuildArgs): PlannedJob {
	const { otNumber, vbNumber, month, client, line, quantity, plant, r } = args;
	const press = plant.presses.find((p) => p.key === line.press) ?? plant.presses[0];

	// ── 1. Lo que el asistente calcularía ────────────────────────────────────
	const finishes = { ...EMPTY_FINISHES };
	for (const f of line.finishes) finishes[f] = true;

	const limit = { maxWidthCm: press.maxWidthCm, maxHeightCm: press.maxHeightCm };
	const impo = computeImposition(line.widthCm, line.heightCm, quantity, limit);

	const form: OTFormData = {
		...INITIAL_OT_FORM,
		client_name: client.name,
		product_name: line.label,
		quantity,
		product_type: line.productType,
		width_cm: line.widthCm,
		height_cm: line.heightCm,
		substrate_type: line.substrate,
		grammage_gsm: line.gsm,
		color_front: line.colorFront,
		color_back: line.colorBack,
		finishes,
		imposition: impo,
	};

	const calcs = computeOTCalculations(form, {
		pressLimit: limit,
		machineSpeedSheetsHr: press.speedSheetsHr,
		pressBodies: press.bodies,
		inkCoverage: line.inkCoverage,
	});
	form.calculations = calcs;

	const operations = generateDefaultOperations(form, calcs, plant.rates);
	const pricing = computeOTPricing(operations, quantity, line.marginPct, line.incrementPct, 1);
	form.operations = operations;
	form.pricing = pricing;

	const estimateLines: CostLine[] = operations.map((op) => ({
		category: categoryOf(op),
		description: op.name,
		quantity: op.quantity,
		unit: op.unit,
		unitCost: op.unit_cost,
		total: op.total_cost,
	}));

	// ── 2. Lo que efectivamente pasó ─────────────────────────────────────────
	// El costo real no se sortea. Se sortea el MOTIVO, y de ahí salen los
	// pliegos, las horas y la plata como consecuencia.
	const deviation = drawDeviation(r);

	// Papel: el motor ya reservó merma de proceso. Encima va la del taller.
	const mermaExtra = between(r, ...line.mermaBand) + deviation.papelExtra;
	const sheetsEntered = Math.round(calcs.calc_sheets * (1 + Math.max(-0.03, mermaExtra)));
	// Lo perdido es lo que entró y no salió vendible: la merma de proceso que
	// el motor ya contaba, más la que se agregó.
	const netSheets = Math.ceil(quantity / Math.max(1, impo.poses_per_sheet));
	const sheetsWasted = Math.max(0, sheetsEntered - netSheets);

	const hourFactor = 1 + deviation.horasExtra;
	const pressHours = Math.round(calcs.calc_print_hours * hourFactor * 100) / 100;
	const finishHours = Math.round(calcs.calc_finish_hours * hourFactor * 100) / 100;

	// ── 3. La gente, y de ahí la mano de obra real ───────────────────────────
	// Si las terminaciones van afuera, la gente del taller no las hace: no hay
	// turno que asignar y tampoco costo de mano de obra que cargar.
	const crew = buildCrew({
		plant, press, pressHours,
		finishHours: args.finishingOutsourced ? 0 : finishHours,
		line, startedOn: args.startedOn, r,
	});
	const laborActual = crew.reduce((s, c) => s + c.cost, 0);

	// ── 4. Las demás partidas reales ─────────────────────────────────────────
	const substratePerSheet =
		calcs.calc_substrate_kg > 0
			? (calcs.calc_substrate_kg / calcs.calc_sheets) * (plant.rates.substrate_per_kg ?? 1500)
			: 0;
	const materialActual = Math.round(
		sheetsEntered * substratePerSheet +
			(estimateLines.find((l) => l.description === 'Tintas')?.total ?? 0) * (1 + deviation.papelExtra) +
			(estimateLines.find((l) => l.description === 'Placas CTP')?.total ?? 0),
	);

	// La tarifa del catálogo («Offset 4 Colores, $85.000 la hora») ya es una
	// tarifa de taller: lleva dentro energía, depreciación y mantención. Sumarle
	// otra vez el costo de hora-máquina contaría dos veces lo mismo. El costo
	// fijo de la prensa vive en `machine_costs`, por mes y por máquina, que es
	// donde el taller lo mira.
	const machineActual = Math.round(pressHours * (plant.rates.offset_print_per_hour ?? 25000));

	const finishingEstimate = estimateLines
		.filter((l) => l.category === 'finishing')
		.reduce((s, l) => s + l.total, 0);
	const finishingDone = Math.round(finishingEstimate * hourFactor);

	// Hecho adentro va como terminaciones; hecho afuera va como tercerizado y
	// con el recargo. Es la misma hora de trabajo contada donde corresponde,
	// para que la pregunta «¿cuánto nos cuesta no tener capacidad?» se pueda
	// responder desde la base y no de memoria.
	const finishingActual = args.finishingOutsourced ? 0 : finishingDone;
	const outsourcedActual = args.finishingOutsourced
		? Math.round(finishingDone * (1 + OUTSOURCING_PREMIUM))
		: Math.round(deviation.tercerizado * (materialActual + machineActual + finishingDone));

	const overheadPct = plant.rates.overhead_pct ?? 8;
	const baseForOverhead = materialActual + laborActual + machineActual + finishingActual + outsourcedActual;
	const overheadActual = Math.round(baseForOverhead * (overheadPct / 100));

	const actualLines: CostLine[] = ([
		{ category: 'material' as const, description: `Papel consumido — ${sheetsEntered.toLocaleString('es-CL')} pliegos entrados`, quantity: sheetsEntered, unit: 'pliego', unitCost: substratePerSheet, total: materialActual },
		{ category: 'labor' as const, description: `Mano de obra del taller — ${crew.length} turnos asignados`, quantity: round2(crew.reduce((s, c) => s + c.hours, 0)), unit: 'hrs', unitCost: crew.length ? Math.round(laborActual / Math.max(1, crew.reduce((s, c) => s + c.hours, 0))) : 0, total: laborActual },
		{ category: 'machine' as const, description: `Hora de prensa — ${press.name}`, quantity: pressHours, unit: 'hrs', unitCost: pressHours ? Math.round(machineActual / pressHours) : 0, total: machineActual },
		{ category: 'finishing' as const, description: 'Terminaciones en el taller', quantity: finishHours, unit: 'hrs', unitCost: finishHours ? Math.round(finishingActual / finishHours) : 0, total: finishingActual },
		...(outsourcedActual > 0
			? [{
					category: 'outsourced' as const,
					description: args.finishingOutsourced
						? `Terminaciones en taller externo — ${round2(finishHours)} h, recargo ${Math.round(OUTSOURCING_PREMIUM * 100)}%`
						: 'Servicio externo de troquelado',
					quantity: args.finishingOutsourced ? round2(finishHours) : 1,
					unit: args.finishingOutsourced ? 'hrs' : 'global',
					unitCost: args.finishingOutsourced ? Math.round(outsourcedActual / Math.max(0.1, finishHours)) : outsourcedActual,
					total: outsourcedActual,
				}]
			: []),
		{ category: 'overhead' as const, description: `Gastos generales (${overheadPct}%)`, quantity: 1, unit: 'global', unitCost: overheadActual, total: overheadActual },
	] satisfies CostLine[]).filter((l) => l.total > 0);

	const estimatedCost = estimateLines.reduce((s, l) => s + l.total, 0);
	const actualCost = actualLines.reduce((s, l) => s + l.total, 0);
	const revenue = pricing.total_price;

	return {
		otNumber, vbNumber, month, client, line, quantity, press,
		form, calcs, operations, pricing,
		quotedOn: iso(args.quotedOn),
		approvedOn: iso(addDays(args.quotedOn, 2 + Math.floor(r() * 4))),
		startedOn: iso(args.startedOn),
		finishedOn: args.finishedOn ? iso(args.finishedOn) : null,
		deadline: iso(addDays(args.startedOn, 10 + Math.floor(r() * 12))),
		status: args.status,
		closed: args.finishedOn !== null,
		estimateLines,
		actualLines,
		deviation,
		sheetsEntered,
		sheetsWasted,
		pressHours,
		finishHours,
		finishingOutsourced: args.finishingOutsourced,
		crew,
		// Los partes se escriben cuando los turnos ya tienen nombre: el que
		// manda el mensaje es el operario que estuvo en la máquina.
		captures: [],
		revenue,
		estimatedCost,
		actualCost,
		grossMargin: revenue - actualCost,
	};
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ─── La cuadrilla ───────────────────────────────────────────── */

/**
 * Reparte el trabajo en turnos de a lo más 8 horas y le pone nombre a cada uno.
 *
 * Todos los turnos llevan la OT. Es el campo que hacía que la mano de obra
 * valiera cero en toda la app: una asignación sin `ot_id` es una persona que
 * trabajó para nadie.
 */
function buildCrew(args: {
	plant: Plant; press: PressRef; pressHours: number; finishHours: number;
	line: ProductLine; startedOn: Date; r: () => number;
}): CrewShift[] {
	const { plant, press, pressHours, finishHours, line, startedOn, r } = args;
	const out: CrewShift[] = [];

	// La persona la elige después `scheduleCrew`, que es quien conoce el mes
	// entero y puede respetar el turno único por día. Acá sólo se dice cuánto
	// trabajo hay, de qué tipo y en qué máquina.
	const spread = (
		total: number,
		pool: CrewPool,
		people: PersonRef[],
		machineId: string,
		role: string,
		dayOffset: number,
	) => {
		if (total <= 0 || people.length === 0) return;
		// Tarifa provisoria: el promedio de la banca. El planificador la corrige
		// cuando le pone nombre al turno; la diferencia entre operarios del
		// mismo oficio es de un dígito, así que el objetivo del mes no se mueve.
		const avg = people.reduce((a, p) => a + p.hourlyRate, 0) / people.length;
		let left = total;
		let day = dayOffset;
		while (left > 0.05) {
			const hours = round2(Math.min(8, left));
			out.push({
				personId: '', personName: '', pool,
				machineId, role,
				date: iso(addDays(startedOn, day)),
				hours,
				cost: Math.round(hours * avg),
			});
			left -= hours;
			day += 1;
		}
	};

	// Pre-prensa: montar planchas es una hora por color, y ocurre antes.
	spread(Math.max(1, plantPlates(line)), 'prepress', plant.crew.prepress, plant.presses[0].id, 'Pre-prensa', -1);
	spread(pressHours, 'press', plant.crew.press, press.id, 'Operador de prensa', 0);

	// Las terminaciones parten cuando la prensa ya sacó la mitad.
	const finishStart = Math.max(1, Math.floor(pressHours / 8 / 2));
	spread(finishHours * 0.35, 'cut', plant.crew.cut, plant.guillotineIds[0], 'Guillotina', finishStart);
	spread(finishHours * 0.65, 'finish', plant.crew.finish, plant.finisherMachineIds[0], 'Terminaciones', finishStart);

	return out;
}

/** Horas de pre-prensa: una por plancha, redondeada hacia arriba. */
function plantPlates(line: ProductLine): number {
	const count = (m: OTColorMode) =>
		m === 'cmyk' ? 4 : m === 'cmyk_pantone' ? 5 : m === '3_color' ? 3 : m === '2_color' ? 2 : m === '1_color' ? 1 : 0;
	return count(line.colorFront) + count(line.colorBack);
}

/* ─── Los partes del taller ──────────────────────────────────── */

/**
 * Los mensajes que el operario manda por WhatsApp.
 *
 * Se escriben como texto, no como JSON: el sembrador los pasa por el
 * `whatsapp-parser` de la app, así que `parsed_data` es una lectura de verdad y
 * no una invención que casualmente calza. Si el analizador se rompe, la demo lo
 * muestra, que es exactamente lo que uno quiere de una demo.
 */
export function buildCaptures(args: {
	otNumber: string; crew: CrewShift[]; sheetsEntered: number; sheetsWasted: number;
	pressHours: number; deviation: Deviation; closed: boolean; r: () => number;
}): CaptureMsg[] {
	const { otNumber, crew, sheetsEntered, sheetsWasted, pressHours, deviation, closed, r } = args;
	const pressShifts = crew.filter((c) => c.role === 'Operador de prensa');
	if (pressShifts.length === 0) return [];

	const first = pressShifts[0];
	const out: CaptureMsg[] = [
		{
			text: `arranco ot ${otNumber}, montaje listo`,
			operatorId: first.personId,
			operatorName: first.personName,
			at: `${first.date}T${8 + Math.floor(r() * 2)}:${String(Math.floor(r() * 59)).padStart(2, '0')}:00-04:00`,
			kind: 'start',
		},
	];

	if (!closed) return out;

	// El cierre reparte lo producido entre los turnos, con la merma en el
	// último — que es como se reporta: uno cuenta al final lo que se botó.
	//
	// La redacción no es libre. «45.000 buenos, 900 de merma» es la forma que el
	// analizador lee bien; «45.000 pliegos buenos» le hace tomar el 900 como
	// buenos, porque el patrón de buenos también acepta el número que va DESPUÉS
	// de la palabra. Se escribe como el taller escribe, dentro de lo que la app
	// entiende — y la prueba de este archivo lo verifica pasando el texto por el
	// analizador de verdad.
	const buenos = sheetsEntered - sheetsWasted;
	const porTurno = Math.floor(buenos / pressShifts.length);
	pressShifts.forEach((s, i) => {
		const ultimo = i === pressShifts.length - 1;
		const cantidad = ultimo ? buenos - porTurno * (pressShifts.length - 1) : porTurno;
		const horas = Math.min(8, Math.round((pressHours / pressShifts.length) * 10) / 10);
		const merma = ultimo && sheetsWasted > 0 ? `, ${sheetsWasted} de merma` : '';
		const nota = ultimo && deviation.key === 'reproceso' ? ', hubo que repetir por registro' : '';
		out.push({
			text: `listo ot ${otNumber}, ${cantidad} buenos${merma}, ${horas} horas offset${nota}`,
			operatorId: s.personId,
			operatorName: s.personName,
			at: `${s.date}T${15 + Math.floor(r() * 3)}:${String(Math.floor(r() * 59)).padStart(2, '0')}:00-04:00`,
			kind: 'end',
		});
	});

	return out;
}

/* ─── El plan del mes ────────────────────────────────────────── */

export interface MonthPlan {
	month: MonthKey;
	jobs: PlannedJob[];
	revenue: number;
	actualCost: number;
	grossMargin: number;
	pressHours: number;
	finishHours: number;
	/** Horas de terminación hechas con máquinas propias. */
	finishHoursInHouse: number;
	/** Horas que no cupieron y se mandaron a un tercero. */
	finishHoursOutsourced: number;
	sheets: number;
}

/** Los estados del Kanban por los que pasa un trabajo en curso. */
const OPEN_STATUSES = [
	'pre_press', 'visto_bueno', 'paper_purchase', 'in_storage',
	'guillotine_first_cut', 'offset_printing', 'die_cutting',
	'guillotine_final_cut', 'workshop', 'workshop_revision', 'ready_for_delivery', 'in_delivery',
] as const;

function weightedPick<T extends { weight: number }>(r: () => number, xs: readonly T[]): T {
	const total = xs.reduce((s, x) => s + x.weight, 0);
	let x = r() * total;
	for (const item of xs) {
		x -= item.weight;
		if (x <= 0) return item;
	}
	return xs[xs.length - 1];
}

/**
 * Genera trabajos hasta que el margen bruto del mes alcanza el objetivo.
 *
 * Se cuenta el margen REAL, no el cotizado: es el número que la gerencia mira y
 * el único que no se puede maquillar desde la cotización.
 */
export function planMonth(args: {
	month: MonthKey;
	plant: Plant;
	seed: number;
	targetMargin: number;
	/** Día del mes hasta el que hay historia. El mes en curso se corta antes. */
	throughDay: number;
	startingOtNumber: number;
	/**
	 * Cuántos trabajos entrar, en vez de apuntar al margen.
	 *
	 * El mes en curso se planifica así: al día 8 el taller no lleva el margen de
	 * un mes entero, lleva ocho días de trabajo. Apuntar al margen en un mes
	 * incompleto llenaría el Kanban de cincuenta órdenes abiertas que ningún
	 * taller tiene a la vez.
	 */
	targetJobs?: number;
	/**
	 * Sólo el mes en curso deja trabajo a medio hacer. Un mes cerrado con OT
	 * abiertas sería un taller que dejó cosas botadas en la máquina.
	 */
	leaveWorkOpen: boolean;
	/**
	 * Horas de terminación que las máquinas del taller alcanzan a hacer en el
	 * mes. Lo que pase de ahí se manda afuera — ver `outsourceOverflow`.
	 */
	finishingCapacityHours: number;
}): MonthPlan {
	const { month, plant, seed, targetMargin, throughDay, startingOtNumber } = args;
	const r = rng(seed);
	const [y, m] = month.split('-').map(Number);
	const daysInMonth = new Date(y, m, 0).getDate();
	const lastDay = Math.min(throughDay, daysInMonth);

	const jobs: PlannedJob[] = [];
	let margin = 0;
	let n = startingOtNumber;
	let guard = 0;
	/** Horas de terminación ya comprometidas en máquinas propias este mes. */
	let finishingUsed = 0;

	const done = () =>
		args.targetJobs != null ? jobs.length >= args.targetJobs : margin >= targetMargin;

	while (!done() && guard++ < 400) {
		const client = weightedPick(r, CLIENT_BOOK);
		const lineKey = pick(r, client.buys);
		const line = PRODUCT_LINES.find((l) => l.key === lineKey) ?? PRODUCT_LINES[0];
		const quantity = roundTo(between(r, line.runs[0], line.runs[1]), 1_000);

		const startDay = 1 + Math.floor(r() * lastDay);
		const startedOn = new Date(Date.UTC(y, m - 1, startDay, 12));
		const durationDays = 3 + Math.floor(r() * 6);
		const endDay = startDay + durationDays;
		const stillOpen = args.leaveWorkOpen && endDay > lastDay;

		const common = {
			otNumber: String(n),
			vbNumber: `VB-${month.replace('-', '')}-${String(jobs.length + 1).padStart(3, '0')}`,
			month, client, line, quantity, plant,
			quotedOn: new Date(Date.UTC(y, m - 1, Math.max(1, startDay - 9), 12)),
			startedOn,
			finishedOn: stillOpen ? null : new Date(Date.UTC(y, m - 1, endDay, 12)),
			status: stillOpen ? OPEN_STATUSES[Math.floor(r() * OPEN_STATUSES.length)] : 'completed',
		};

		// El sorteo de cada trabajo se siembra aparte, así el trabajo se puede
		// volver a construir con otra decisión de terminaciones sin correr el
		// resto del mes.
		const jobSeed = seed * 31 + guard * 7919;
		let job = buildJob({ ...common, r: rng(jobSeed), finishingOutsourced: false });

		// ── El cuello de botella de una imprenta no es la prensa ──────────────
		// Son las terminaciones. Cuando las máquinas propias ya están tomadas,
		// el trabajo se manda a un tercero: es lo que hace un taller real, y
		// cuesta más que hacerlo en casa.
		if (finishingUsed + job.finishHours > args.finishingCapacityHours) {
			job = buildJob({ ...common, r: rng(jobSeed), finishingOutsourced: true });
		} else {
			finishingUsed += job.finishHours;
		}

		n += 1;
		jobs.push(job);
		// Sólo lo terminado cuenta para el margen del mes: un trabajo a medio
		// hacer no dejó nada todavía.
		if (job.closed) margin += job.grossMargin;
	}

	// Los turnos NO se reparten acá. Ver `planShop`: el turnero necesita ver
	// todos los meses de una vez, porque las semanas no respetan el calendario.
	const closed = jobs.filter((j) => j.closed);
	return {
		month,
		jobs,
		revenue: closed.reduce((s, j) => s + j.revenue, 0),
		actualCost: closed.reduce((s, j) => s + j.actualCost, 0),
		grossMargin: closed.reduce((s, j) => s + j.grossMargin, 0),
		pressHours: jobs.reduce((s, j) => s + j.pressHours, 0),
		finishHours: jobs.reduce((s, j) => s + j.finishHours, 0),
		finishHoursInHouse: jobs.filter((j) => !j.finishingOutsourced).reduce((s, j) => s + j.finishHours, 0),
		finishHoursOutsourced: jobs.filter((j) => j.finishingOutsourced).reduce((s, j) => s + j.finishHours, 0),
		sheets: jobs.reduce((s, j) => s + j.sheetsEntered, 0),
	};
}

/* ─── El turnero ─────────────────────────────────────────────── */

/**
 * Le pone nombre a cada turno del mes.
 *
 * No es un detalle de implementación: la base tiene un disparador
 * (`validate_worker_assignment_compliance`) que cuenta las horas del TURNO, no
 * las trabajadas. Un turno son ocho horas, así que **una persona admite una
 * sola asignación por día** y unas cinco por semana. Escribir la asignación sin
 * respetar eso no produce datos malos: produce un error de Postgres a mitad de
 * la siembra.
 *
 * Que la restricción viva acá y no en el escritor tiene una razón: es una regla
 * del taller —cuánto puede trabajar una persona— y las reglas del taller se
 * prueban.
 */
export interface ScheduleReport {
	shifts: number;
	/** Turnos que hubo que correr de día porque la banca estaba tomada. */
	moved: number;
	/** Turnos que no se pudieron colocar dentro de la ventana. */
	dropped: number;
	/** Turnos por persona, para ver si alguien quedó sobrecargado. */
	perPerson: Map<string, number>;
}

export function scheduleCrew(
	jobs: PlannedJob[],
	plant: Plant,
	opts: { maxShiftsPerWeek?: number; seed?: number } = {},
): ScheduleReport {
	const maxPerWeek = opts.maxShiftsPerWeek ?? 5;
	const r = rng(opts.seed ?? 991);

	/** persona|fecha ya tomada. */
	const taken = new Set<string>();
	/** persona|semana → turnos. */
	const weekly = new Map<string, number>();
	const perPerson = new Map<string, number>();
	let moved = 0;
	let dropped = 0;
	let shifts = 0;

	const weekOf = (d: string) => {
		const t = new Date(d + 'T00:00:00Z');
		const day = (t.getUTCDay() + 6) % 7; // lunes = 0
		return iso(addDays(t, -day));
	};

	// Se recorre el mes en orden de fecha: quien pide primero, elige primero.
	const todos = jobs
		.flatMap((j) => j.crew.map((c) => ({ job: j, shift: c })))
		.sort((a, b) => a.shift.date.localeCompare(b.shift.date));

	for (const { shift } of todos) {
		const pool = plant.crew[shift.pool];
		if (pool.length === 0) { dropped += 1; continue; }

		let colocado = false;
		for (let delta = 0; delta <= 8 && !colocado; delta++) {
			const cuando = addDays(new Date(shift.date + 'T00:00:00Z'), delta);
			// El taller trabaja de lunes a sábado. Sin esta línea el turnero
			// reparte treinta turnos en un mes de treinta y un días, que es una
			// persona que no descansó nunca.
			if (cuando.getUTCDay() === 0) continue;
			const fecha = iso(cuando);
			const semana = weekOf(fecha);

			// El menos cargado de la semana primero, con desempate al azar para
			// que el trabajo no caiga siempre sobre el mismo nombre.
			const candidatos = [...pool]
				.map((p) => ({ p, carga: weekly.get(`${p.id}|${semana}`) ?? 0, t: r() }))
				.filter((c) => !taken.has(`${c.p.id}|${fecha}`) && c.carga < maxPerWeek)
				.sort((a, b) => a.carga - b.carga || a.t - b.t);

			if (candidatos.length === 0) continue;

			const elegido = candidatos[0].p;
			taken.add(`${elegido.id}|${fecha}`);
			weekly.set(`${elegido.id}|${semana}`, (weekly.get(`${elegido.id}|${semana}`) ?? 0) + 1);
			perPerson.set(elegido.name, (perPerson.get(elegido.name) ?? 0) + 1);

			shift.personId = elegido.id;
			shift.personName = elegido.name;
			shift.cost = Math.round(shift.hours * elegido.hourlyRate);
			if (fecha !== shift.date) moved += 1;
			shift.date = fecha;
			colocado = true;
			shifts += 1;
		}

		if (!colocado) dropped += 1;
	}

	// Los turnos que no se pudieron colocar se descartan, y con ellos su costo:
	// una asignación sin persona no es mano de obra, es una intención.
	for (const j of jobs) {
		j.crew = j.crew.filter((c) => c.personId !== '');

		const labor = j.crew.reduce((s, c) => s + c.cost, 0);
		const linea = j.actualLines.find((l) => l.category === 'labor');
		if (linea) {
			const horas = round2(j.crew.reduce((s, c) => s + c.hours, 0));
			linea.total = labor;
			linea.quantity = horas;
			linea.unitCost = horas > 0 ? Math.round(labor / horas) : 0;
			linea.description = `Mano de obra del taller — ${j.crew.length} turnos asignados`;
		}
		j.actualCost = j.actualLines.reduce((s, l) => s + l.total, 0);
		j.grossMargin = j.revenue - j.actualCost;

		j.captures = buildCaptures({
			otNumber: j.otNumber,
			crew: j.crew,
			sheetsEntered: j.sheetsEntered,
			sheetsWasted: j.sheetsWasted,
			pressHours: j.pressHours,
			deviation: j.deviation,
			closed: j.closed,
			r,
		});
	}

	return { shifts, moved, dropped, perPerson };
}

/* ─── El taller entero, no mes por mes ───────────────────────── */

/**
 * Planifica todos los meses y recién entonces reparte los turnos.
 *
 * ── Por qué no se puede hacer mes por mes ───────────────────────────────────
 *
 * Porque las semanas no respetan el calendario. La semana del lunes 29 de junio
 * termina el domingo 5 de julio: si junio reparte sus turnos y julio los suyos,
 * cada uno cree tener esa semana entera y entre los dos le cargan diez turnos a
 * la misma persona.
 *
 * Y hay un segundo camino al mismo choque: los turnos de pre-prensa empiezan un
 * día ANTES de que la OT entre a máquina, así que un trabajo del día 1 pone un
 * turno en el mes anterior — que ya estaba repartido y cerrado.
 *
 * Medido sobre los cuatro meses de la demo antes de arreglarlo: 97 casos de dos
 * turnos el mismo día y 50 semanas sobre el tope, TODOS en los lunes que cruzan
 * el borde de mes. No es una tendencia difusa, es una costura.
 *
 * La consecuencia no era un número feo en un informe:
 * `validate_worker_assignment_compliance` cuenta las horas del turno y rechaza
 * la fila, así que la siembra se detenía. Un turnero que planifica de a un mes
 * describe a un taller que despide a todos el día 30 y contrata otros el día 1.
 */
export function planShop(args: {
	months: readonly MonthKey[];
	plant: Plant;
	targetMargin: number;
	/** Día hasta el que llega la historia en el mes en curso. */
	currentMonthThroughDay: number;
	startingOtNumber: number;
	finishingCapacityHours: number;
}): { plans: MonthPlan[]; schedule: ScheduleReport } {
	const plans: MonthPlan[] = [];
	let numero = args.startingOtNumber;

	for (const mes of args.months) {
		const enCurso = mes === args.months[args.months.length - 1];
		// El ritmo del mes en curso sale del promedio de los cerrados: al día 9 el
		// taller no lleva un mes de margen, lleva nueve días de trabajo.
		const ritmo = plans.length > 0
			? Math.round(plans.reduce((s, p) => s + p.jobs.length, 0) / plans.length)
			: 75;

		const plan = planMonth({
			month: mes,
			plant: args.plant,
			seed: Number(mes.replace('-', '')),
			targetMargin: args.targetMargin,
			targetJobs: enCurso ? Math.round((ritmo * args.currentMonthThroughDay) / 31) : undefined,
			throughDay: enCurso ? args.currentMonthThroughDay : 31,
			startingOtNumber: numero,
			leaveWorkOpen: enCurso,
			finishingCapacityHours: args.finishingCapacityHours,
		});

		numero += plan.jobs.length;
		plans.push(plan);
	}

	// Una sola pasada del turnero sobre TODOS los trabajos, ordenados por fecha.
	const todos = plans.flatMap((p) => p.jobs);
	const schedule = scheduleCrew(todos, args.plant, { seed: 4242 });

	// Repartir cambia el costo de mano de obra —cada persona cobra lo suyo— así
	// que los totales del mes se recalculan sobre lo que quedó.
	for (const p of plans) {
		const cerrados = p.jobs.filter((j) => j.closed);
		p.revenue = cerrados.reduce((s, j) => s + j.revenue, 0);
		p.actualCost = cerrados.reduce((s, j) => s + j.actualCost, 0);
		p.grossMargin = cerrados.reduce((s, j) => s + j.grossMargin, 0);
	}

	return { plans, schedule };
}
