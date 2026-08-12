/**
 * Siembra la demo: un taller de imprenta completo, coherente de punta a punta.
 *
 *   npx tsx scripts/seed/index.ts            → dice qué haría, no escribe nada
 *   npx tsx scripts/seed/index.ts --write    → lo aplica
 *
 * ── Qué respeta y qué reemplaza ─────────────────────────────────────────────
 *
 * RESPETA lo que es del taller de verdad: las máquinas (la flota real, con sus
 * nombres y sus velocidades), los usuarios y sus roles —si se borran, nadie
 * entra—, el catálogo de competencias, el catálogo de costos y las dos OT
 * históricas que ya existían.
 *
 * REEMPLAZA lo transaccional: cotizaciones, órdenes, costos, programación,
 * asignaciones, capturas, compras, guías y facturas. Eso es lo que la siembra
 * anterior dejó incoherente y es lo que esta reconstruye.
 *
 * ── El orden importa ────────────────────────────────────────────────────────
 *
 * Se recorre el hilo de oro hacia adelante, y nada nace huérfano:
 *
 *   cliente → visto bueno → OT → orden de compra con líneas → lote de papel
 *           → programación de máquina → turnos CON ot_id → parte de WhatsApp
 *           → consumo de bodega → costo real → guía de despacho → factura
 *
 * Cada paso sólo puede escribirse porque el anterior ya existe. Es la misma
 * razón por la que la app puede después reconstruir el costo: la cadena está
 * entera.
 */

import {
	MONTHLY_MARGIN_TARGET_CLP,
	MONTHS,
	CLIENT_BOOK,
	SALESMEN,
	TURNOS,
	planShop,
	type MonthPlan,
	type PersonRef,
	type Plant,
	type PlannedJob,
	type ScheduleReport,
} from './model';
import { parseWhatsAppMessage } from '../../src/lib/whatsapp-parser';
import { actualizar, borrar, contar, insertar, leer, uuid } from './db';

const ESCRIBIR = process.argv.includes('--write');
const HOY = '2026-08-09';
const DIA_DEL_MES_EN_CURSO = 9;

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const pad = (s: string | number, n: number) => String(s).padStart(n);

function titulo(t: string) {
	console.log(`\n\x1b[1m${t}\x1b[0m\n${'─'.repeat(Math.min(78, t.length + 20))}`);
}

/* ─── 1. Lo que hay antes de tocar nada ──────────────────────── */

/**
 * Tablas que la siembra vacía, en orden de dependencia (hijas primero).
 * `ot_cost_lines`, `ot_operations` y compañía caen solas por CASCADE al borrar
 * las OT, pero se listan igual: el informe tiene que decir cuántas filas se
 * llevan por delante, y «cayó en cascada» no es una respuesta.
 */
const TRANSACCIONALES = [
	'capture_events', 'whatsapp_production_logs', 'whatsapp_warehouse_logs',
	'worker_assignments', 'attendance_events', 'ot_machine_schedule',
	'ot_cost_lines', 'ot_operations', 'ot_real_costs', 'ot_financials',
	'ot_status_history', 'ot_state_transitions', 'ot_approvals', 'ot_attachments',
	'sales_invoices', 'dispatch_guides', 'purchase_invoices', 'purchase_items',
	'inventory_stock_transactions', 'inventory_lots', 'purchases',
	'vistos_buenos', 'ots', 'machine_costs', 'machine_usage_readings', 'notifications',
];

/** Lo que NUNCA se toca. */
const INTOCABLES = ['users', 'user_roles', 'machines', 'skills', 'cost_catalog', 'shifts', 'inventory_items'];

async function inventario(): Promise<void> {
	titulo('Lo que hay en la base ahora');
	for (const t of [...TRANSACCIONALES.slice(0, 12), 'ots', 'clients', 'employees', ...INTOCABLES]) {
		const n = await contar(t).catch(() => -1);
		if (n < 0) continue;
		const marca = t === 'employees'
			? '\x1b[32mse conserva y se amplía\x1b[0m'
			: INTOCABLES.includes(t) ? '\x1b[32mse conserva\x1b[0m'
			: n > 0 ? '\x1b[33mse reemplaza\x1b[0m' : '';
		console.log(`  ${t.padEnd(32)} ${pad(n, 6)}  ${marca}`);
	}
}

/** La numeración que el sembrador se reserva. Todo lo de abajo es histórico. */
const PRIMERA_OT_SEMBRADA = 41001;

/**
 * Las OT históricas se conservan; las sembradas se reemplazan.
 *
 * El criterio es el NÚMERO, no «lo que haya hoy en la tabla». La primera
 * versión preguntaba por todas las filas existentes y las preservaba, lo cual
 * funciona exactamente una vez: en la segunda corrida preserva las 258 que
 * sembró la primera y escribe 256 encima. Una siembra que no se puede repetir
 * no sirve, porque la primera corrida siempre encuentra algo que arreglar.
 */
async function otsQueSobreviven(): Promise<string[]> {
	const filas = await leer<{ id: string; ot_number: string }>('ots?select=id,ot_number');
	return filas
		.filter((f) => {
			const n = parseInt(String(f.ot_number).replace(/\D/g, ''), 10);
			// Sin número legible se conserva: borrar algo que no se entiende es peor.
			return !Number.isFinite(n) || n < PRIMERA_OT_SEMBRADA;
		})
		.map((f) => f.id);
}

async function limpiar(conservar: string[]): Promise<void> {
	titulo('Limpieza');
	const filtro = conservar.length > 0 ? `id=not.in.(${conservar.join(',')})` : 'id=not.is.null';

	// Las hijas de las OT que se conservan también se van: sus costos y capturas
	// pertenecían al mundo viejo y no cuadran con el nuevo.
	for (const t of TRANSACCIONALES) {
		if (t === 'ots') continue;
		await borrar(t, 'id=not.is.null');
		console.log(`  vaciada  ${t}`);
	}
	await borrar('ots', filtro);
	console.log(`  ots      todas salvo ${conservar.length} históricas`);

	await borrar('clients', 'id=not.is.null');
	console.log('  vaciada  clients');
}

/* ─── 2. La gente ────────────────────────────────────────────── */

interface NuevoEmpleado {
	code: string; name: string; dept: string; email: string; phone: string;
	rate: number; sheetsPerHour?: number;
}

/**
 * La dotación que el volumen exige.
 *
 * No es un número elegido: sale de las horas que el plan pide. Con turno único
 * por persona y día, 780 horas de prensa al mes son 98 turnos, y 98 turnos no
 * los cubren tres operarios. Un taller que factura $1.300 millones al mes tiene
 * cuarenta personas, no veinte.
 */
const REFUERZOS: NuevoEmpleado[] = [
	// Comercial — `salesman_id` apunta a empleados, así que los vendedores viven acá.
	{ code: 'EMP-101', name: SALESMEN[0].name, dept: 'Comercial', email: SALESMEN[0].email, phone: SALESMEN[0].phone, rate: 9500 },
	{ code: 'EMP-102', name: SALESMEN[1].name, dept: 'Comercial', email: SALESMEN[1].email, phone: SALESMEN[1].phone, rate: 9500 },
	{ code: 'EMP-103', name: SALESMEN[2].name, dept: 'Comercial', email: SALESMEN[2].email, phone: SALESMEN[2].phone, rate: 9200 },
	// Prensa — segundo turno.
	{ code: 'EMP-104', name: 'Nelson Painecura', dept: 'Impresión Offset', email: 'npainecura@demo.local', phone: '+56 9 6120 4481', rate: 8300, sheetsPerHour: 7100 },
	{ code: 'EMP-105', name: 'Óscar Maldonado', dept: 'Impresión Offset', email: 'omaldonado@demo.local', phone: '+56 9 6120 4482', rate: 8100, sheetsPerHour: 6900 },
	{ code: 'EMP-106', name: 'Gustavo Ibáñez', dept: 'Impresión Offset', email: 'gibanez@demo.local', phone: '+56 9 6120 4483', rate: 7800, sheetsPerHour: 6600 },
	// Corte.
	{ code: 'EMP-107', name: 'Hernán Cáceres', dept: 'Corte', email: 'hcaceres@demo.local', phone: '+56 9 6120 4484', rate: 7100 },
	{ code: 'EMP-108', name: 'Marcela Quiroz', dept: 'Corte', email: 'mquiroz@demo.local', phone: '+56 9 6120 4485', rate: 6900 },
	{ code: 'EMP-109', name: 'Iván Sepúlveda', dept: 'Corte', email: 'isepulveda@demo.local', phone: '+56 9 6120 4486', rate: 6800 },
	// Terminaciones.
	{ code: 'EMP-110', name: 'Ruth Cárcamo', dept: 'Terminaciones', email: 'rcarcamo@demo.local', phone: '+56 9 6120 4487', rate: 6400 },
	{ code: 'EMP-111', name: 'Bernardo Antileo', dept: 'Terminaciones', email: 'bantileo@demo.local', phone: '+56 9 6120 4488', rate: 6600 },
	{ code: 'EMP-112', name: 'Sonia Peñaloza', dept: 'Terminaciones', email: 'spenaloza@demo.local', phone: '+56 9 6120 4489', rate: 6300 },
	{ code: 'EMP-113', name: 'Álvaro Huenchul', dept: 'Terminaciones', email: 'ahuenchul@demo.local', phone: '+56 9 6120 4490', rate: 6500 },
	// Pre-prensa.
	{ code: 'EMP-114', name: 'Javiera Bustos', dept: 'Pre-Prensa', email: 'jbustos@demo.local', phone: '+56 9 6120 4491', rate: 9100 },
	// Bodega y despacho.
	{ code: 'EMP-115', name: 'Gonzalo Riquelme', dept: 'Bodega', email: 'griquelme@demo.local', phone: '+56 9 6120 4492', rate: 6000 },
	{ code: 'EMP-116', name: 'Camila Ovalle', dept: 'Despacho', email: 'covalle@demo.local', phone: '+56 9 6120 4493', rate: 6200 },
	// Mantención.
	{ code: 'EMP-117', name: 'Luis Tapia', dept: 'Mantención', email: 'ltapia@demo.local', phone: '+56 9 6120 4494', rate: 8800 },
	{ code: 'EMP-118', name: 'Fabián Alarcón', dept: 'Mantención', email: 'falarcon@demo.local', phone: '+56 9 6120 4495', rate: 8400 },
];

async function gente(): Promise<void> {
	titulo('Gente');
	const existentes = await leer<{ id: string; full_name: string; employee_code: string | null; department: string; status: string }>(
		'employees?select=id,full_name,employee_code,department,status',
	);
	const porCodigo = new Map(existentes.filter((e) => e.employee_code).map((e) => [e.employee_code!, e]));

	const nuevos = REFUERZOS.filter((r) => !porCodigo.has(r.code));
	console.log(`  ${existentes.filter((e) => e.status === 'active').length} activos · ${nuevos.length} a incorporar`);
	if (!ESCRIBIR || nuevos.length === 0) return;

	const filas = nuevos.map((r) => ({
		id: uuid(),
		full_name: r.name,
		employee_code: r.code,
		department: r.dept,
		email: r.email,
		phone: r.phone,
		status: 'active',
		hire_date: '2024-03-01',
		sheets_per_hour: r.sheetsPerHour ?? 0,
		// El código de credencial existe para que el QR del taller funcione. Sin
		// él, «marcar entrada escaneando» es una función que no se puede demostrar.
		badge_code: r.code.replace('EMP-', 'CRD'),
	}));
	const creados = await insertar<{ id: string; employee_code: string }>('employees', filas, { devolver: true });

	// Contrato y tarifa: sin contrato el disparador de asignaciones deja pasar
	// cualquier cosa, y sin tarifa la mano de obra vale cero.
	await insertar('employment_contracts', creados.map((c) => ({
		employee_id: c.id, contract_type: 'full_time', start_date: '2024-03-01',
		base_hours_per_week: 44, max_hours_per_day: 9, max_hours_per_week: 45,
		minimum_rest_hours: 11, overtime_allowed: true, overtime_cap_hours_per_week: 6, is_active: true,
	})));
	await insertar('compensation_rates', creados.map((c) => ({
		employee_id: c.id,
		hourly_rate: REFUERZOS.find((r) => r.code === c.employee_code)!.rate,
		effective_from: '2024-03-01', currency_code: 'CLP',
		overtime_multiplier_50: 1.5, overtime_multiplier_100: 2,
		night_shift_multiplier: 1.2, weekend_multiplier: 1.3, incentive_eligibility: true,
	})));

	// Los que ya estaban y no tenían credencial tampoco pueden marcar.
	for (const e of existentes.filter((x) => x.employee_code && x.status === 'active')) {
		await actualizar('employees', `id=eq.${e.id}`, { badge_code: e.employee_code!.replace('EMP-', 'CRD') });
	}
	console.log(`  ${creados.length} incorporados con contrato, tarifa y credencial`);
}

/* ─── 3. Los clientes ────────────────────────────────────────── */

async function clientes(vendedores: Map<string, string>): Promise<Map<string, string>> {
	titulo('Clientes');
	if (!ESCRIBIR) {
		console.log(`  ${CLIENT_BOOK.length} cuentas · las cinco mayores hacen la mitad de la venta`);
		return new Map();
	}
	const filas = CLIENT_BOOK.map((c) => ({
		id: uuid(), name: c.name, rut: c.rut, city: c.city,
		contact_name: `Contacto ${c.name.split(' ')[0]}`,
		email: `contacto@${c.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)}.cl`,
		phone: `+56 ${2 + Math.floor(Math.random() * 7)} ${Math.floor(1000 + Math.random() * 8999)} ${Math.floor(1000 + Math.random() * 8999)}`,
		payment_terms: c.paymentTerms,
		notes: c.giro,
		is_active: true,
		salesman_id: vendedores.get(SALESMEN[c.salesman].name) ?? null,
	}));
	const creados = await insertar<{ id: string; name: string }>('clients', filas, { devolver: true });
	console.log(`  ${creados.length} cuentas creadas`);
	return new Map(creados.map((c) => [c.name, c.id]));
}

/* ─── 4. La planta ───────────────────────────────────────────── */

/** Costo fijo mensual por máquina, en pesos. La siembra vieja los traía en dólares. */
const COSTO_FIJO_MENSUAL: Record<string, { energia: number; deprec: number; mant: number; kw: number }> = {
	'Ryobi Offset 524GS #1': { energia: 3_400, deprec: 2_450_000, mant: 890_000, kw: 22 },
	'Ryobi Offset 524GS #2': { energia: 3_400, deprec: 2_100_000, mant: 940_000, kw: 22 },
	'Roland 300':            { energia: 2_600, deprec: 1_350_000, mant: 620_000, kw: 17 },
	'Troqueladora':          { energia: 2_100, deprec: 1_150_000, mant: 510_000, kw: 14 },
	'Guillotine #1':         { energia: 1_100, deprec: 420_000, mant: 180_000, kw: 7 },
	'Guillotine #2':         { energia: 1_000, deprec: 380_000, mant: 165_000, kw: 6.5 },
	'Guillotine #3':         { energia: 900, deprec: 310_000, mant: 140_000, kw: 6 },
	'Dobladora':             { energia: 1_400, deprec: 560_000, mant: 240_000, kw: 9 },
	'Alzadora':              { energia: 1_200, deprec: 480_000, mant: 210_000, kw: 8 },
	'Corchetera':            { energia: 900, deprec: 290_000, mant: 130_000, kw: 6 },
	'Hotmelera':             { energia: 1_800, deprec: 720_000, mant: 340_000, kw: 12 },
	'Polilaminadora':        { energia: 1_600, deprec: 640_000, mant: 295_000, kw: 11 },
};

async function economiaDeMaquinas(): Promise<void> {
	titulo('Economía de las máquinas');
	const maquinas = await leer<{ id: string; name: string; energy_cost_per_hr: number | null }>(
		'machines?select=id,name,energy_cost_per_hr',
	);
	let tocadas = 0;
	for (const m of maquinas) {
		const c = COSTO_FIJO_MENSUAL[m.name];
		if (!c) continue;
		tocadas += 1;
		if (!ESCRIBIR) continue;
		await actualizar('machines', `id=eq.${m.id}`, {
			energy_cost_per_hr: c.energia, depreciation_monthly: c.deprec,
			maintenance_cost_monthly: c.mant, power_kw: c.kw,
		});
	}
	console.log(`  ${tocadas} máquinas con costo en pesos (venían en escala de dólares: $1,68 la hora de una Ryobi)`);
}

async function construirPlanta(): Promise<Plant> {
	const maquinas = await leer<any>('machines?select=id,name,type,colors,optimal_speed_sheets_hr,max_print_width_mm,max_print_height_mm');
	const empleados = await leer<any>('employees?select=id,full_name,department,status&status=eq.active');
	const tarifas = await leer<any>('compensation_rates?select=employee_id,hourly_rate,effective_to');
	const catalogo = await leer<any>('cost_catalog?select=catalog_key,name,category,unit_cost,is_active&is_active=eq.true');

	const tarifaDe = new Map<string, number>();
	for (const t of tarifas) if (!t.effective_to) tarifaDe.set(t.employee_id, Number(t.hourly_rate));

	// En ensayo la base todavía no tiene a los refuerzos, y sin ellos el informe
	// mentiría: mostraría cientos de turnos sin cubrir que en la corrida real sí
	// se cubren. El ensayo tiene que predecir la escritura, no otra cosa.
	const plantilla: { id: string; full_name: string; department: string; rate: number }[] = [
		...empleados.map((e: any) => ({ id: e.id, full_name: e.full_name, department: e.department ?? '', rate: tarifaDe.get(e.id) ?? 7000 })),
		...(ESCRIBIR ? [] : REFUERZOS.map((r) => ({ id: `previsto:${r.code}`, full_name: r.name, department: r.dept, rate: r.rate }))),
	];

	const banca = (deptos: string[]): PersonRef[] =>
		plantilla
			.filter((e) => deptos.some((d) => e.department.toLowerCase().includes(d)))
			.map((e) => ({ id: e.id, name: e.full_name, hourlyRate: e.rate }));

	const buscar = (nombre: string) => maquinas.find((m: any) => m.name === nombre);
	const ryobi = buscar('Ryobi Offset 524GS #1') ?? maquinas.find((m: any) => m.type === 'offset_printer');
	const roland = buscar('Roland 300') ?? ryobi;

	// El catálogo de costos manda: es el mismo que lee el asistente de cotización.
	const porClave = new Map(catalogo.filter((c: any) => c.catalog_key).map((c: any) => [c.catalog_key, Number(c.unit_cost)]));
	const porNombre = new Map(catalogo.map((c: any) => [c.name, Number(c.unit_cost)]));
	const rates = {
		substrate_per_kg: porNombre.get('Cartulina 300 grs') ?? 2800,
		ink_per_kg: porClave.get('tinta_cmyk') ?? 31915,
		plate_per_unit: porClave.get('plancha_ctp') ?? 8500,
		offset_print_per_hour: porClave.get('offset_4c') ?? 85000,
		cut_per_hour: porClave.get('corte_guillotina') ?? 18000,
		troquelado_per_hour: porClave.get('troquelado') ?? 25000,
		plegado_per_hour: porClave.get('doblado') ?? 15000,
		pegado_per_hour: porClave.get('pegado_automatico') ?? 20000,
		laminado_per_hour: porNombre.get('Laminado Mate') ?? 3500,
		barniz_per_hour: porClave.get('barniz') ?? 25000,
		relieve_per_hour: 6000,
		perforado_per_hour: porClave.get('perforado') ?? 8000,
		hot_stamping_per_hour: porClave.get('hot_stamping') ?? 40000,
		uv_localizado_per_hour: porClave.get('uv_localizado') ?? 35000,
		numeracion_per_hour: porClave.get('numeracion') ?? 12000,
		press_labor_per_hour: porClave.get('operador_prensa') ?? 8500,
		finish_labor_per_hour: porClave.get('operador_terminaciones') ?? 6500,
		overhead_pct: porClave.get('overhead_general') ?? 8,
	};

	const mm2cm = (v: number | null, porDefecto: number) => (v ? v / 10 : porDefecto);

	return {
		presses: [
			{ id: ryobi.id, name: ryobi.name, key: 'ryobi', bodies: ryobi.colors ?? 4,
			  speedSheetsHr: ryobi.optimal_speed_sheets_hr ?? 7500,
			  maxWidthCm: mm2cm(ryobi.max_print_width_mm, 37), maxHeightCm: mm2cm(ryobi.max_print_height_mm, 52) },
			{ id: roland.id, name: roland.name, key: 'roland', bodies: roland.colors ?? 1,
			  speedSheetsHr: roland.optimal_speed_sheets_hr ?? 9000,
			  maxWidthCm: mm2cm(roland.max_print_width_mm, 37), maxHeightCm: mm2cm(roland.max_print_height_mm, 52) },
		],
		dieCutterId: buscar('Troqueladora')?.id ?? ryobi.id,
		guillotineIds: maquinas.filter((m: any) => m.type === 'guillotine').map((m: any) => m.id),
		finisherMachineIds: maquinas
			.filter((m: any) => ['folder', 'collator', 'stitcher', 'perfect_binder', 'laminator'].includes(m.type))
			.map((m: any) => m.id),
		crew: {
			press: banca(['impresión offset', 'impresion offset']),
			cut: banca(['corte']),
			finish: banca(['terminaciones', 'troquelado']),
			prepress: banca(['pre-prensa', 'pre prensa']),
		},
		rates,
		machineHourCost: {},
	};
}

/* ─── 5. Los meses ───────────────────────────────────────────── */

/**
 * Horas de terminación que las máquinas propias alcanzan a hacer en un mes:
 * seis máquinas × dos turnos × 22 días × 8 horas.
 */
const CAPACIDAD_TERMINACIONES_MES = 6 * 2 * 22 * 8;

function planificar(plant: Plant): { planes: MonthPlan[]; turnero: ScheduleReport } {
	// Los turnos se reparten UNA vez sobre los cuatro meses, no mes por mes. Ver
	// `planShop`: una semana puede cruzar el borde de mes, y repartir por mes le
	// carga diez turnos a la misma persona en la semana compartida — que es lo
	// que hacía que Postgres rechazara las asignaciones.
	const { plans, schedule } = planShop({
		months: MONTHS,
		plant,
		targetMargin: MONTHLY_MARGIN_TARGET_CLP,
		currentMonthThroughDay: DIA_DEL_MES_EN_CURSO,
		startingOtNumber: PRIMERA_OT_SEMBRADA,
		finishingCapacityHours: CAPACIDAD_TERMINACIONES_MES,
	});
	return { planes: plans, turnero: schedule };
}

function informeDelPlan(planes: MonthPlan[], turnero: ScheduleReport): void {
	titulo('El taller que describe el plan');
	console.log('  mes      OT   cerradas          venta           costo          margen    %    pliegos  h-prensa  h-term(propias/fuera)');
	for (const p of planes) {
		const cerradas = p.jobs.filter((j) => j.closed).length;
		console.log(
			`  ${p.month}  ${pad(p.jobs.length, 3)}  ${pad(cerradas, 8)}  ${pad(clp(p.revenue), 14)}  ${pad(clp(p.actualCost), 14)}  ${pad(clp(p.grossMargin), 14)}  ` +
			`${pad((100 * p.grossMargin / Math.max(1, p.revenue)).toFixed(1), 4)}  ${pad(p.sheets.toLocaleString('es-CL'), 9)}  ${pad(p.pressHours.toFixed(0), 8)}  ` +
			`${pad(p.finishHoursInHouse.toFixed(0), 6)}/${p.finishHoursOutsourced.toFixed(0)}`,
		);
	}

	const cerrados = planes.flatMap((p) => p.jobs).filter((j) => j.closed);
	titulo('Por línea de producto — los meses cerrados');
	const porLinea = new Map<string, { n: number; venta: number; margen: number; horas: number }>();
	for (const j of cerrados) {
		const a = porLinea.get(j.line.label) ?? { n: 0, venta: 0, margen: 0, horas: 0 };
		a.n += 1; a.venta += j.revenue; a.margen += j.grossMargin; a.horas += j.pressHours;
		porLinea.set(j.line.label, a);
	}
	for (const [k, v] of [...porLinea].sort((a, b) => b[1].margen / b[1].horas - a[1].margen / a[1].horas)) {
		console.log(`  ${k.padEnd(36)} n=${pad(v.n, 3)}  venta ${pad(clp(v.venta), 15)}  margen ${pad((100 * v.margen / v.venta).toFixed(1), 5)}%  ${pad(clp(v.margen / v.horas), 12)} por hora de prensa`);
	}

	titulo('Dotación — los cuatro meses de una vez');
	const top = [...turnero.perPerson].sort((a, b) => b[1] - a[1]).slice(0, 3);
	console.log(
		`  ${turnero.shifts} turnos repartidos · ${turnero.moved} corridos de día porque la banca estaba tomada · ` +
		`${turnero.dropped > 0 ? `\x1b[31m${turnero.dropped} sin cubrir\x1b[0m` : '\x1b[32mtodos cubiertos\x1b[0m'}`,
	);
	if (top.length > 0) {
		console.log(`  Los más cargados: ${top.map(([n, v]) => `${n} (${v})`).join(' · ')}`);
	}
	if (turnero.dropped > 0) {
		console.log('  \x1b[33mUn turno sin cubrir es trabajo que nadie hizo: su mano de obra no se carga a la OT.\x1b[0m');
		console.log('  \x1b[33mSi el número es alto, al taller le falta gente para el volumen del plan.\x1b[0m');
	}

	const fuera = cerrados.filter((j) => j.finishingOutsourced);
	const costoFuera = fuera.reduce((s, j) => s + (j.actualLines.find((l) => l.category === 'outsourced')?.total ?? 0), 0);
	console.log(`\n  Terminaciones afuera: ${fuera.length} de ${cerrados.length} trabajos, ${clp(costoFuera)} — el taller no tiene capacidad para hacerlas en casa.`);
}

/* ─── 6. Escribir el hilo de oro ─────────────────────────────── */

const FINISH_COLS = [
	'finish_troquelado', 'finish_plegado', 'finish_pegado', 'finish_laminado', 'finish_barniz',
	'finish_relieve', 'finish_perforado', 'finish_hot_stamping', 'finish_uv_localizado', 'finish_numeracion',
] as const;

const enTiempo = (fecha: string, hora = 9) => `${fecha}T${String(hora).padStart(2, '0')}:00:00-04:00`;

async function escribirTrabajos(
	planes: MonthPlan[],
	plant: Plant,
	clientesPorNombre: Map<string, string>,
	vendedores: Map<string, string>,
	turnos: { manana: string; tarde: string; noche: string },
): Promise<Map<string, string>> {
	titulo('OT, cotizaciones y costos');
	const trabajos = planes.flatMap((p) => p.jobs);

	// ── Vistos buenos ────────────────────────────────────────────────────────
	const vbPorOt = new Map<string, string>();
	const vbFilas = trabajos.map((j) => {
		const id = uuid();
		vbPorOt.set(j.otNumber, id);
		return {
			id, vb_number: j.vbNumber,
			client_id: clientesPorNombre.get(j.client.name) ?? null,
			client_name: j.client.name,
			salesman_id: vendedores.get(SALESMEN[j.client.salesman].name) ?? null,
			status: 'converted',
			product_name: j.line.label, product_type: j.line.productType,
			quantity: j.quantity, width_cm: j.line.widthCm, height_cm: j.line.heightCm,
			substrate_type: j.line.substrate, grammage_gsm: j.line.gsm,
			color_front: j.line.colorFront, color_back: j.line.colorBack,
			ink_coverage: j.line.inkCoverage,
			subtotal_cost: j.estimatedCost,
			margin_pct: j.line.marginPct, markup_pct: j.line.incrementPct,
			unit_price: j.pricing.unit_price, total_price: j.revenue,
			finishes: Object.fromEntries(j.line.finishes.map((f) => [f, true])),
			estimate_lines: j.estimateLines.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, unit_cost: l.unitCost, total: l.total })),
			valid_until: j.deadline,
			signed_at: enTiempo(j.approvedOn, 11),
			signed_by_name: `Contacto ${j.client.name.split(' ')[0]}`,
			created_at: enTiempo(j.quotedOn, 10),
		};
	});
	if (ESCRIBIR) await insertar('vistos_buenos', vbFilas);
	console.log(`  ${vbFilas.length} vistos buenos`);

	// ── OT ───────────────────────────────────────────────────────────────────
	const otPorNumero = new Map<string, string>();
	const otFilas = trabajos.map((j) => {
		const id = uuid();
		otPorNumero.set(j.otNumber, id);
		const finishes = Object.fromEntries(FINISH_COLS.map((c) => [c, j.line.finishes.includes(c)]));
		return {
			id, ot_number: j.otNumber, vb_id: vbPorOt.get(j.otNumber),
			client_id: clientesPorNombre.get(j.client.name) ?? null,
			client_name: j.client.name,
			salesman_id: vendedores.get(SALESMEN[j.client.salesman].name) ?? null,
			product_name: j.line.label, product_type: j.line.productType,
			description: `${j.line.label} para ${j.client.name}`,
			quantity: j.quantity,
			width_cm: j.line.widthCm, height_cm: j.line.heightCm,
			substrate_type: j.line.substrate, grammage_gsm: j.line.gsm,
			color_front: j.line.colorFront, color_back: j.line.colorBack,
			ink_coverage: j.line.inkCoverage,
			...finishes,
			calc_sheets: j.calcs.calc_sheets,
			calc_substrate_kg: j.calcs.calc_substrate_kg,
			calc_ink_kg: j.calcs.calc_ink_kg,
			calc_plates: j.calcs.calc_plates,
			calc_print_hours: j.calcs.calc_print_hours,
			calc_finish_hours: j.calcs.calc_finish_hours,
			subtotal: j.pricing.subtotal,
			margin_pct: j.pricing.margin_pct, margin_amount: j.pricing.margin_amount,
			increment_pct: j.pricing.increment_pct, increment_amount: j.pricing.increment_amount,
			commission_pct: j.pricing.commission_pct, commission_amount: j.pricing.commission_amount,
			unit_price: j.pricing.unit_price, total_price: j.revenue,
			status: j.status,
			priority_level: j.line.key === 'estuche_vino' ? 'alta' : 'normal',
			assigned_machine_id: j.press.id,
			deadline: j.deadline,
			completed_at: j.finishedOn ? enTiempo(j.finishedOn, 17) : null,
			created_at: enTiempo(j.approvedOn, 12),
			// Las banderas del tablero cuentan lo mismo que el estado.
			flag_vbp: true, flag_ord: true, flag_plan: true,
			flag_pro: j.closed || ['offset_printing', 'die_cutting', 'workshop'].includes(j.status),
			flag_paper_arrived: true,
		};
	});
	if (ESCRIBIR) await insertar('ots', otFilas);
	console.log(`  ${otFilas.length} OT`);

	// El vínculo iba en una sola dirección: la OT sabía de qué cotización salió
	// (`ots.vb_id`) y la cotización no sabía en qué OT se convirtió. La columna
	// existe y estaba vacía, así que la pantalla de Cotizaciones no puede llevar
	// a la orden que originó — que es la pregunta obvia del vendedor.
	//
	// Se llena DESPUÉS de insertar las OT, porque antes no hay a qué apuntar.
	if (ESCRIBIR) {
		for (const j of trabajos) {
			const vbId = vbPorOt.get(j.otNumber);
			const otId = otPorNumero.get(j.otNumber);
			if (vbId && otId) await actualizar('vistos_buenos', `id=eq.${vbId}`, { ot_id: otId });
		}
		console.log(`  ${trabajos.length} cotizaciones enlazadas a su OT`);
	}

	// ── Operaciones y ledger ─────────────────────────────────────────────────
	const ops: any[] = [];
	const lineas: any[] = [];
	const financials: any[] = [];
	const historia: any[] = [];

	for (const j of trabajos) {
		const otId = otPorNumero.get(j.otNumber)!;
		j.operations.forEach((o, i) => {
			// `total_cost` es una columna GENERADA —ROUND(quantity × unit_cost)— y
			// mandarla hace que Postgres rechace la fila entera. Es la misma
			// trampa que `ot_cost_lines.total`, en otra tabla.
			ops.push({
				ot_id: otId, category: o.category, name: o.name, unit: o.unit,
				quantity: o.quantity, unit_cost: o.unit_cost, sort_order: i,
			});
		});

		for (const l of j.estimateLines) {
			lineas.push({
				ot_id: otId, kind: 'estimate', category: l.category, source: 'wizard',
				description: l.description, quantity: l.quantity, unit: l.unit,
				unit_cost: l.unitCost, occurred_at: enTiempo(j.approvedOn, 12),
			});
		}
		// `ot_cost_lines.total` es una columna generada: vale ROUND(cantidad ×
		// costo unitario). Por eso el costo unitario se deriva del total y no al
		// revés — así lo que la vista suma es lo que el modelo calculó.
		if (j.closed) {
			for (const l of j.actualLines) {
				const q = l.quantity > 0 ? l.quantity : 1;
				lineas.push({
					ot_id: otId, kind: 'actual', category: l.category, source: 'system',
					description: l.description, quantity: q, unit: l.unit,
					unit_cost: Math.round((l.total / q) * 10_000) / 10_000,
					occurred_at: enTiempo(j.finishedOn!, 18),
					notes: l.category === 'material' ? j.deviation.causa : null,
				});
			}
			financials.push({
				ot_id: otId,
				revenue: j.revenue,
				material_cost: j.actualLines.filter((l) => l.category === 'material').reduce((s, l) => s + l.total, 0),
				labor_cost: j.actualLines.filter((l) => l.category === 'labor').reduce((s, l) => s + l.total, 0),
				machine_cost: j.actualLines.filter((l) => l.category === 'machine').reduce((s, l) => s + l.total, 0),
				outsourcing_cost: j.actualLines.filter((l) => l.category === 'outsourced').reduce((s, l) => s + l.total, 0),
				overhead_cost: j.actualLines.filter((l) => l.category === 'overhead').reduce((s, l) => s + l.total, 0),
				// `total_cost` y `profit` son columnas generadas: las calcula la
				// base sumando las partidas de arriba. La migración de 2026-08-11
				// las recreó incluyendo el tercerizado, que antes omitían.
				hours_spent: Math.round((j.pressHours + j.finishHours) * 100) / 100,
				notes: j.deviation.causa,
			});
		}

		historia.push(
			{ ot_id: otId, to_status: 'pre_press', reason: 'Visto bueno firmado por el cliente', created_at: enTiempo(j.approvedOn, 12) },
			{ ot_id: otId, from_status: 'pre_press', to_status: 'offset_printing', reason: 'Planchas montadas', created_at: enTiempo(j.startedOn, 8) },
		);
		if (j.closed) {
			historia.push({ ot_id: otId, from_status: 'offset_printing', to_status: 'completed', reason: 'Trabajo entregado', created_at: enTiempo(j.finishedOn!, 17) });
		}
	}

	if (ESCRIBIR) {
		await insertar('ot_operations', ops);
		await insertar('ot_cost_lines', lineas);
		await insertar('ot_financials', financials);
		await insertar('ot_status_history', historia);
	}
	console.log(`  ${ops.length} operaciones · ${lineas.length} líneas de costo · ${financials.length} cierres financieros`);

	// ── Programación de máquina ──────────────────────────────────────────────
	const programa = trabajos.map((j) => ({
		ot_id: otPorNumero.get(j.otNumber)!, machine_id: j.press.id,
		scheduled_start: enTiempo(j.startedOn, 8),
		scheduled_end: enTiempo(j.finishedOn ?? j.deadline, 17),
		actual_start: enTiempo(j.startedOn, 8),
		actual_end: j.finishedOn ? enTiempo(j.finishedOn, 17) : null,
		estimated_hours: j.calcs.calc_print_hours,
		actual_hours: j.closed ? Math.round(j.pressHours * 100) / 100 : null,
		calc_sheets: j.calcs.calc_sheets,
		sheet_width_cm: j.form.imposition?.format_w ?? null,
		sheet_height_cm: j.form.imposition?.format_h ?? null,
		paper_type_label: `${j.line.substrate} ${j.line.gsm} g`,
		sort_order: 0,
	}));
	if (ESCRIBIR) await insertar('ot_machine_schedule', programa);
	console.log(`  ${programa.length} bloques de máquina programados`);

	// ── Turnos: el campo que hacía valer cero la mano de obra ────────────────
	const asignaciones = trabajos.flatMap((j) =>
		j.crew.map((c) => ({
			employee_id: c.personId,
			machine_id: c.machineId,
			ot_id: otPorNumero.get(j.otNumber)!,
			// El turno lo decidió el turnero, por persona y por semana. Elegirlo
			// acá según las horas del trabajo —como se hacía— podía mandar a
			// alguien a salir 23:00 y volver 07:00: ocho horas de descanso donde
			// el contrato pide doce, y la base lo rechaza.
			shift_id: c.turno === 'tarde' ? turnos.tarde : turnos.manana,
			role: c.role,
			date: c.date,
			hours_worked: c.hours,
		})),
	);
	if (ESCRIBIR) await insertar('worker_assignments', asignaciones);
	console.log(`  ${asignaciones.length} turnos asignados, todos con OT`);

	// Marcas de entrada y salida del mes en curso. Sin ellas el módulo de
	// asistencia queda vacío y el código de credencial no demuestra nada; con
	// los cuatro meses enteros serían diez mil filas que nadie va a mirar.
	const mesActual = MONTHS[MONTHS.length - 1];
	const marcas = trabajos
		.filter((j) => j.month === mesActual)
		.flatMap((j) => j.crew.flatMap((c) => [
			// `clock_in` / `clock_out`, no `check_in`. Es el vocabulario del enum de
			// la tabla y el que usa `/api/attendance/clock` — inventar un tercero
			// habría dejado las marcas sembradas invisibles para la pantalla que
			// las lee, aunque estuvieran en la base.
			{ employee_id: c.personId, machine_id: c.machineId, event_type: 'clock_in', method: 'qr', at: enTiempo(c.date, TURNOS[c.turno].inicio) },
			{ employee_id: c.personId, machine_id: c.machineId, event_type: 'clock_out', method: 'qr', at: enTiempo(c.date, TURNOS[c.turno].fin) },
		]));
	if (ESCRIBIR) await insertar('attendance_events', marcas);
	console.log(`  ${marcas.length} marcas de asistencia del mes en curso`);

	// ── Los partes del taller ────────────────────────────────────────────────
	const logs: any[] = [];
	for (const j of trabajos) {
		const otId = otPorNumero.get(j.otNumber)!;
		for (const c of j.captures) {
			// El texto pasa por el analizador de la app. `parsed_data` es una
			// lectura de verdad, no un JSON escrito a mano que casualmente calza.
			const leido = parseWhatsAppMessage(c.text);
			logs.push({
				ot_id: otId, ot_number: j.otNumber,
				operator_employee_id: c.operatorId, operator_name: c.operatorName,
				operator_phone: `+569${6120000 + (c.operatorName.length * 7)}`,
				raw_message: c.text, parsed_data: leido.production_data,
				message_type: leido.message_type, message_timestamp: c.at,
				review_status: 'auto_approved', fed_to_system: true,
			});
		}
	}
	// Se escribe SÓLO el parte. Un disparador —`mirror_legacy_capture`— copia
	// cada uno a `capture_events` con todo lo que la bandeja unificada necesita.
	//
	// Insertar las dos cosas, como se hacía, metía CADA CAPTURA DOS VECES: 687
	// partes producían 1.374 capturas, y la merma de Analítica habría salido al
	// doble sin que nada avisara. El conteo del informe lo tenía a la vista desde
	// la primera corrida y nadie lo miró — un número exactamente duplicado se lee
	// como un número grande.
	if (ESCRIBIR) await insertar('whatsapp_production_logs', logs);
	console.log(`  ${logs.length} partes de WhatsApp, leídos por el analizador de la app`);
	console.log(`  ${logs.length} capturas creadas por el espejo de la base, una por parte`);

	// ── Guías y facturas ─────────────────────────────────────────────────────
	const cerrados = trabajos.filter((j) => j.closed);
	const guias = cerrados.map((j, i) => ({
		id: uuid(),
		guide_number: `GD-${String(100_000 + i)}`,
		ot_id: otPorNumero.get(j.otNumber)!,
		client_id: clientesPorNombre.get(j.client.name) ?? null,
		client_name: j.client.name,
		quantity: j.quantity,
		dispatch_date: j.finishedOn!,
		status: 'delivered',
		carrier: 'Transportes del Maule',
		vehicle_plate: ['JHKL-42', 'PTRV-18', 'RXDS-77'][i % 3],
		received_by: `Bodega ${j.client.name.split(' ')[0]}`,
	}));
	if (ESCRIBIR) await insertar('dispatch_guides', guias);

	const facturas = cerrados.map((j, i) => {
		const neto = Math.round(j.revenue / 1.19);
		const emision = new Date(j.finishedOn! + 'T12:00:00Z');
		const vence = new Date(emision.getTime() + j.client.paymentTerms * 86_400_000);
		const pagada = vence.toISOString().slice(0, 10) < HOY;
		return {
			invoice_number: `F-${String(500_000 + i)}`,
			ot_id: otPorNumero.get(j.otNumber)!,
			client_id: clientesPorNombre.get(j.client.name) ?? null,
			client_name: j.client.name,
			net_amount: neto, tax_amount: j.revenue - neto, total_amount: j.revenue,
			issued_date: j.finishedOn!,
			due_date: vence.toISOString().slice(0, 10),
			paid_date: pagada ? vence.toISOString().slice(0, 10) : null,
			status: pagada ? 'paid' : 'sent',
		};
	});
	if (ESCRIBIR) await insertar('sales_invoices', facturas);
	console.log(`  ${guias.length} guías de despacho · ${facturas.length} facturas de venta`);

	return otPorNumero;
}

/* ─── 7. Compras: de dónde salió el papel ────────────────────── */

const PROVEEDORES = [
	{ nombre: 'Papeles Bío Bío S.A.', rut: '96.532.410-8', giro: 'Distribución de papel y cartulina' },
	{ nombre: 'Cartulinas del Pacífico Ltda.', rut: '77.204.556-1', giro: 'Importación de cartulina' },
	{ nombre: 'Insumos Gráficos Andes', rut: '76.881.330-4', giro: 'Insumos para artes gráficas' },
];

async function compras(planes: MonthPlan[], otPorNumero: Map<string, string>): Promise<void> {
	titulo('Compras de papel');
	const items = await leer<any>('inventory_items?select=id,sku,name,unit,estimated_unit_cost,sheet_width_cm,sheet_height_cm,grammage_gsm&category=eq.product_input');

	/** El mismo criterio que usa `costing-resolver`: nombre por palabra clave y gramaje más cercano. */
	const buscarItem = (sustrato: string, gsm: number) => {
		const clave = { couche: 'couch', cartulina: 'cartulina', bond: 'bond', kraft: 'kraft', adhesivo: 'adhesiv' }[sustrato] ?? sustrato;
		const cand = items.filter((i: any) => i.name.toLowerCase().includes(clave));
		if (cand.length === 0) return null;
		return cand.sort((a: any, b: any) => Math.abs((a.grammage_gsm ?? 9999) - gsm) - Math.abs((b.grammage_gsm ?? 9999) - gsm))[0];
	};

	const ocs: any[] = [];
	const lineasOc: any[] = [];
	const lotes: any[] = [];
	const facturasCompra: any[] = [];
	const movimientos: any[] = [];
	let n = 0;

	for (const plan of planes) {
		// Una orden de compra por trabajo grande, y el resto agrupado por material:
		// así el papel de una OT se puede rastrear hasta su factura, que es lo que
		// pide la trazabilidad de envase alimentario.
		for (const j of plan.jobs) {
			const item = buscarItem(j.line.substrate, j.line.gsm);
			if (!item) continue;
			const prov = PROVEEDORES[n % PROVEEDORES.length];
			const ocId = uuid();
			const loteId = uuid();
			const kg = j.calcs.calc_substrate_kg;
			const costoUnit = Number(item.estimated_unit_cost) || 2800;
			// Los que se compran por resma se piden en resmas, no en kilos.
			const porResma = item.unit === 'resma';
			const pliegoKg = item.sheet_width_cm && item.grammage_gsm
				? (Number(item.sheet_width_cm) / 100) * (Number(item.sheet_height_cm) / 100) * Number(item.grammage_gsm) / 1000
				: 0.175 * j.line.gsm / 1000;
			const cantidad = porResma ? Math.ceil(kg / pliegoKg / 500) : Math.ceil(kg);
			const total = Math.round(cantidad * costoUnit);
			const fecha = j.quotedOn;

			ocs.push({
				id: ocId, oc_number: `OC-${String(70_000 + n)}`,
				supplier: prov.nombre, supplier_rut: prov.rut, supplier_giro: prov.giro,
				purchase_date: fecha, expected_date: j.startedOn,
				ot_id: otPorNumero.get(j.otNumber) ?? null,
				status: j.closed ? 'invoiced' : 'received',
				total_cost: total,
				certification_details: 'Certificado de aptitud para contacto con alimentos — vigente',
			});
			lineasOc.push({ purchase_id: ocId, item_id: item.id, lot_id: loteId, quantity: cantidad, unit_cost: costoUnit, description: `${item.name} — ${porResma ? 'resmas' : 'kg'}` });
			lotes.push({
				id: loteId, item_id: item.id, purchase_id: ocId,
				lot_number: `L-${j.month.replace('-', '')}-${String(n).padStart(4, '0')}`,
				quantity_received: cantidad,
				// El lote se recibe ENTERO. El saldo lo baja el movimiento de
				// consumo, que es para lo que existe un libro mayor de bodega: el
				// disparador `sync_inventory_lot_quantities` descuenta y se niega a
				// bajar de cero. Escribir el saldo acá Y el movimiento después es
				// contar el mismo hecho dos veces, y las dos versiones se
				// contradecían — el lote llegaba en cero y el consumo no tenía de
				// dónde restar.
				quantity_available: cantidad,
				unit_cost: costoUnit, received_date: j.startedOn, supplier_name: prov.nombre,
				certification_code: `FSSC-${String(20_000 + n)}`,
				certification_expires_on: '2027-12-31',
			});
			if (j.closed) {
				facturasCompra.push({
					purchase_id: ocId, invoice_number: `FC-${String(880_000 + n)}`,
					invoice_date: j.startedOn, amount: total, status: 'paid',
					matched_at: enTiempo(j.startedOn, 15),
				});
				movimientos.push({
					item_id: item.id, lot_id: loteId, tx_type: 'consumption',
					// La cantidad va POSITIVA: la dirección la lleva `tx_type`, y la
					// tabla tiene CHECK (quantity > 0). Mandar el consumo en negativo
					// —que es como se piensa un egreso— hace que Postgres rechace la
					// fila. El signo y el tipo son dos formas de decir lo mismo, y
					// esta base eligió el tipo.
					quantity: cantidad, unit_cost: costoUnit,
					reference_code: `OT-${j.otNumber}`,
					notes: `Consumo de la OT ${j.otNumber} — ${j.sheetsEntered.toLocaleString('es-CL')} pliegos entrados a máquina`,
				});
			}
			n += 1;
		}
	}

	if (ESCRIBIR) {
		// El orden NO es cosmético: `purchase_items.lot_id` apunta a
		// `inventory_lots`, y `inventory_lots.purchase_id` a `purchases`. Escribir
		// la línea de compra antes que el lote que cita es exactamente el pecado
		// que este sembrador dice no cometer — una fila que nace apuntando a algo
		// que todavía no existe.
		await insertar('purchases', ocs);
		await insertar('inventory_lots', lotes);
		await insertar('purchase_items', lineasOc);
		await insertar('purchase_invoices', facturasCompra);
		await insertar('inventory_stock_transactions', movimientos);
	}
	console.log(`  ${ocs.length} órdenes de compra · ${lineasOc.length} líneas · ${lotes.length} lotes con certificado · ${facturasCompra.length} facturas`);
	console.log(`  Cada OC lleva su OT: el papel de un trabajo se puede rastrear hasta la factura del proveedor.`);
}

/* ─── 8. Máquinas: contadores y costo mensual ────────────────── */

async function maquinasMes(planes: MonthPlan[], plant: Plant): Promise<void> {
	titulo('Contadores y costo de máquina');
	const maquinas = await leer<any>('machines?select=id,name,type,usage_unit');

	const lecturas: any[] = [];
	const costos: any[] = [];
	// Un contador necesita AL MENOS DOS lecturas para dar una tasa de consumo.
	// Con una sola, la vida de una pieza se queda en porcentaje y nunca se
	// convierte en una fecha de compra.
	let acumulado = new Map<string, number>();
	for (const [i, plan] of planes.entries()) {
		const impresionesMes = Math.round(plan.sheets / Math.max(1, plant.presses.length));
		for (const m of maquinas) {
			const esPrensa = m.type === 'offset_printer';
			const avance = esPrensa ? impresionesMes : Math.round(plan.finishHoursInHouse / 6);
			const previo = acumulado.get(m.id) ?? (esPrensa ? 18_400_000 : 12_000);
			const valor = previo + avance;
			acumulado.set(m.id, valor);
			lecturas.push({
				machine_id: m.id, reading: valor, unit: m.usage_unit ?? (esPrensa ? 'impressions' : 'hours'),
				read_at: enTiempo(`${plan.month}-28`, 18), source: 'manual',
				notes: `Lectura de cierre de ${plan.month}`,
			});

			const fijo = COSTO_FIJO_MENSUAL[m.name];
			if (fijo) {
				const horas = esPrensa ? plan.pressHours / plant.presses.length : plan.finishHoursInHouse / 6;
				costos.push({
					machine_id: m.id, month: `${plan.month}-01`,
					energy_cost: Math.round(horas * fijo.energia),
					maintenance_cost: fijo.mant,
					spare_parts_cost: Math.round(fijo.mant * 0.35),
					labor_cost: 0, outsourcing_cost: 0,
					// `total_operating_cost` es generada. La depreciación queda
					// fuera de esa suma a propósito: es un cargo contable, no una
					// salida de caja del mes, y la tabla suma costos de operar.
					revenue_generated: esPrensa ? Math.round(plan.revenue / plant.presses.length) : 0,
					notes: i === 0 ? 'Costo fijo mensual: energía sobre horas trabajadas, más mantención y depreciación.' : null,
				});
			}
		}
	}

	if (ESCRIBIR) {
		await insertar('machine_usage_readings', lecturas);
		await insertar('machine_costs', costos);
	}
	console.log(`  ${lecturas.length} lecturas de contador (${planes.length} por máquina → hay tasa de consumo, no sólo un porcentaje)`);
	console.log(`  ${costos.length} cierres de costo por máquina y mes`);
}

/* ─── Orquesta ───────────────────────────────────────────────── */

async function main() {
	console.log(
		`\n\x1b[1mSiembra de la demo — imprenta a $${(MONTHLY_MARGIN_TARGET_CLP / 1e6).toFixed(0)} millones de margen al mes\x1b[0m` +
		`\n${ESCRIBIR ? '\x1b[31mMODO ESCRITURA: esto reemplaza los datos transaccionales.\x1b[0m' : '\x1b[36mEnsayo. Nada se escribe. Agregá --write para aplicar.\x1b[0m'}`,
	);

	await inventario();

	const sobreviven = await otsQueSobreviven();
	if (ESCRIBIR) await limpiar(sobreviven);
	else console.log(`\n  (se conservarían ${sobreviven.length} OT históricas; el resto se reemplaza)`);

	await gente();
	await economiaDeMaquinas();

	const empleados = await leer<any>('employees?select=id,full_name&status=eq.active');
	const vendedores = new Map<string, string>(
		SALESMEN.map((s) => [s.name, empleados.find((e: any) => e.full_name === s.name)?.id]).filter((x): x is [string, string] => Boolean(x[1])),
	);
	const clientesPorNombre = await clientes(vendedores);

	const plant = await construirPlanta();
	console.log(
		`\n  Planta: ${plant.presses.length} prensas · prensa ${plant.crew.press.length} · corte ${plant.crew.cut.length} · ` +
		`terminaciones ${plant.crew.finish.length} · pre-prensa ${plant.crew.prepress.length}`,
	);

	const { planes, turnero } = planificar(plant);
	informeDelPlan(planes, turnero);

	const turnosDb = await leer<any>('shifts?select=id,name');
	const turnos = {
		manana: turnosDb.find((t: any) => t.name === 'Turno Mañana')?.id ?? turnosDb[0].id,
		tarde: turnosDb.find((t: any) => t.name === 'Turno Tarde')?.id ?? turnosDb[0].id,
		noche: turnosDb.find((t: any) => t.name === 'Turno Noche')?.id ?? turnosDb[0].id,
	};

	const otPorNumero = await escribirTrabajos(planes, plant, clientesPorNombre, vendedores, turnos);
	await compras(planes, otPorNumero);
	await maquinasMes(planes, plant);

	// ── Verificación: se lee de vuelta lo que la app va a leer ───────────────
	if (ESCRIBIR) {
		titulo('Verificación — leído de vuelta desde la base');
		const resumen = await leer<any>('ot_cost_summary?select=ot_id,revenue,actual_cost,gross_margin&limit=5000');
		const conCosto = resumen.filter((r: any) => Number(r.actual_cost) > 0);
		const venta = conCosto.reduce((s: number, r: any) => s + Number(r.revenue), 0);
		const margen = conCosto.reduce((s: number, r: any) => s + Number(r.gross_margin), 0);
		const meses = MONTHS.length - 1 + DIA_DEL_MES_EN_CURSO / 31;

		console.log(`  OT con costo real cargado    ${pad(conCosto.length, 6)} de ${resumen.length}`);
		console.log(`  Venta acumulada              ${pad(clp(venta), 18)}`);
		console.log(`  Margen bruto acumulado       ${pad(clp(margen), 18)}`);
		console.log(`  Margen por mes               ${pad(clp(margen / meses), 18)}  \x1b[2m(objetivo ${clp(MONTHLY_MARGIN_TARGET_CLP)})\x1b[0m`);

		// ── La cadena, eslabón por eslabón ────────────────────────────────────
		// No basta con que las filas hayan entrado: la tesis del sembrador es que
		// NADA nace huérfano. Se comprueba preguntando por lo HUÉRFANO, que es la
		// única forma de saberlo — contar filas no distingue una cadena entera de
		// veinte tablas llenas que no se conocen entre sí.
		const eslabones: [string, string, string][] = [
			['Turnos sin OT', 'worker_assignments', 'ot_id=is.null'],
			['Turnos sin persona', 'worker_assignments', 'employee_id=is.null'],
			['Capturas sin OT', 'capture_events', 'ot_id=is.null'],
			['OT sin cliente', 'ots', 'client_id=is.null'],
			['OT sin cotización', 'ots', 'vb_id=is.null'],
			['Cotizaciones sin OT', 'vistos_buenos', 'ot_id=is.null'],
			['Líneas de costo sin OT', 'ot_cost_lines', 'ot_id=is.null'],
			['Órdenes de compra sin OT', 'purchases', 'ot_id=is.null'],
			['Líneas de compra sin lote', 'purchase_items', 'lot_id=is.null'],
			['Lotes sin orden de compra', 'inventory_lots', 'purchase_id=is.null'],
			['Guías sin OT', 'dispatch_guides', 'ot_id=is.null'],
			['Facturas sin OT', 'sales_invoices', 'ot_id=is.null'],
		];

		console.log('');
		let rotos = 0;
		for (const [etiqueta, tabla, filtro] of eslabones) {
			// Las dos OT históricas no tienen cotización ni cliente y se conservan
			// a propósito: son del mundo anterior. Se descuentan.
			const historicas = etiqueta.startsWith('OT sin') ? 2 : 0;
			const n = Math.max(0, (await leer<any>(`${tabla}?select=id&${filtro}&limit=500`)).length - historicas);
			if (n > 0) rotos += 1;
			console.log(`  ${etiqueta.padEnd(30)} ${n === 0 ? '\x1b[32mninguno\x1b[0m' : `\x1b[31m${n}\x1b[0m`}`);
		}
		if (rotos === 0) {
			console.log('\n  \x1b[32mLa cadena está entera: el costo de cualquier OT se\x1b[0m');
			console.log('  \x1b[32mpuede reconstruir hasta el parte del taller y la factura\x1b[0m');
			console.log('  \x1b[32mdel proveedor.\x1b[0m');
		}
	}

	console.log(
		ESCRIBIR
			? '\n\x1b[32mListo.\x1b[0m Abrí /analitica/rentabilidad y /planta.\n'
			: '\n\x1b[36mEnsayo terminado.\x1b[0m Corré con --write para aplicarlo.\n',
	);
}

main().catch((e) => {
	console.error('\n\x1b[31mLa siembra se detuvo:\x1b[0m', e.message);
	process.exit(1);
});
