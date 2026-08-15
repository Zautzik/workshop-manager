/**
 * El estante de troqueles.
 *
 * Se siembra aparte del resto porque no es tráfico: es INVENTARIO. Los troqueles
 * sobreviven a los trabajos que los originaron —ese es el punto— así que volver
 * a sembrar la demanda no tiene que borrar el estante.
 *
 * La forma del estante importa tanto como su tamaño. Un estante donde todo calza
 * no demuestra nada: demuestra una tabla. Lo que hay que poder mostrar es que el
 * sistema DISTINGUE, así que se siembran a propósito los casos que un buscador
 * ingenuo confunde:
 *
 *   · el que calza exacto              → «usá este»
 *   · el que calza girado (34×12)      → también sirve, y a ojo no se ve
 *   · el que difiere medio centímetro  → NO sirve, y es el error caro
 *   · el exclusivo de otro cliente     → mide igual y no se puede tocar
 *   · el desgastado                    → sirve, pero avisá antes de la fecha
 *   · el dado de baja                  → no existe para el buscador
 *   · los que nunca se volvieron a usar → la evidencia de por qué esto importa
 *
 * Ejecutar:  npx tsx scripts/seed/dies.ts --write
 */

import { borrar, contar, insertar, leer } from './db';

const ESCRIBIR = process.argv.includes('--write');

interface Semilla {
	code: string;
	name: string;
	product_type: string;
	width_cm: number;
	height_cm: number;
	cavities: number;
	shelf_location: string;
	exclusive: boolean;
	acquisition_cost: number;
	status: 'activo' | 'desgastado' | 'dado_de_baja';
	times_used: number;
	/** Índice del cliente en la lista, para los exclusivos. `null` = genérico. */
	cliente?: number | null;
	notes?: string;
}

/** Las medidas que el taller corta de verdad, tomadas de las líneas del seed. */
const ESTANTE: Semilla[] = [
	// ── Los que calzan con trabajos que existen ──────────────────────────────
	{ code: 'TR-101', name: 'Estuche 12×34 · 2 poses', product_type: 'caja_plegadiza',
	  width_cm: 12, height_cm: 34, cavities: 2, shelf_location: 'A-1', exclusive: false,
	  acquisition_cost: 340_000, status: 'activo', times_used: 23 },
	{ code: 'TR-102', name: 'Caja display 20×30', product_type: 'caja_display',
	  width_cm: 20, height_cm: 30, cavities: 1, shelf_location: 'A-2', exclusive: false,
	  acquisition_cost: 420_000, status: 'activo', times_used: 14 },
	{ code: 'TR-103', name: 'Caja display 28×34', product_type: 'caja_display',
	  width_cm: 28, height_cm: 34, cavities: 1, shelf_location: 'A-3', exclusive: false,
	  acquisition_cost: 465_000, status: 'activo', times_used: 9 },
	{ code: 'TR-104', name: 'Etiqueta 9×13 · 8 poses', product_type: 'etiqueta',
	  width_cm: 9, height_cm: 13, cavities: 8, shelf_location: 'B-1', exclusive: false,
	  acquisition_cost: 295_000, status: 'activo', times_used: 41 },
	{ code: 'TR-105', name: 'Etiqueta 10×12 · 6 poses', product_type: 'etiqueta',
	  width_cm: 10, height_cm: 12, cavities: 6, shelf_location: 'B-2', exclusive: false,
	  acquisition_cost: 310_000, status: 'activo', times_used: 28 },

	// El mismo corte anotado al revés. A ojo en una estantería no se reconoce, y
	// es la confusión que hace comprar de nuevo algo que ya está.
	{ code: 'TR-106', name: 'Estuche 34×12 (anotado girado)', product_type: 'caja_plegadiza',
	  width_cm: 34, height_cm: 12, cavities: 2, shelf_location: 'A-4', exclusive: false,
	  acquisition_cost: 335_000, status: 'activo', times_used: 6,
	  notes: 'Mismo corte que el TR-101, anotado con el lado largo primero.' },

	// ── Los que NO sirven, y que un buscador ingenuo ofrecería ───────────────
	{ code: 'TR-107', name: 'Etiqueta 9,5×13', product_type: 'etiqueta',
	  width_cm: 9.5, height_cm: 13, cavities: 8, shelf_location: 'B-3', exclusive: false,
	  acquisition_cost: 290_000, status: 'activo', times_used: 11,
	  notes: 'Medio centímetro más ancho que el TR-104. No es intercambiable.' },
	{ code: 'TR-108', name: 'Etiqueta 9×13 · exclusiva', product_type: 'etiqueta',
	  width_cm: 9, height_cm: 13, cavities: 8, shelf_location: 'B-4', exclusive: true,
	  acquisition_cost: 380_000, status: 'activo', times_used: 33, cliente: 0,
	  notes: 'Lleva el logo troquelado del cliente. No sirve para nadie más.' },
	{ code: 'TR-109', name: 'Estuche 12×34 · viejo', product_type: 'caja_plegadiza',
	  width_cm: 12, height_cm: 34, cavities: 2, shelf_location: 'C-1', exclusive: false,
	  acquisition_cost: 300_000, status: 'desgastado', times_used: 87,
	  notes: 'Ochenta y siete tirajes encima. Corta, pero deja rebaba en cartulina gruesa.' },
	{ code: 'TR-110', name: 'Caja display 20×30 · roto', product_type: 'caja_display',
	  width_cm: 20, height_cm: 30, cavities: 1, shelf_location: 'C-2', exclusive: false,
	  acquisition_cost: 410_000, status: 'dado_de_baja', times_used: 52,
	  notes: 'Cuchilla vencida en dos esquinas. Se dio de baja.' },

	// ── El resto del estante: medidas que se usan menos ──────────────────────
	{ code: 'TR-111', name: 'Etiqueta redonda Ø7', product_type: 'etiqueta',
	  width_cm: 7, height_cm: 7, cavities: 12, shelf_location: 'B-5', exclusive: false,
	  acquisition_cost: 275_000, status: 'activo', times_used: 19 },
	{ code: 'TR-112', name: 'Etiqueta 6×9', product_type: 'etiqueta',
	  width_cm: 6, height_cm: 9, cavities: 15, shelf_location: 'B-6', exclusive: false,
	  acquisition_cost: 268_000, status: 'activo', times_used: 24 },
	{ code: 'TR-113', name: 'Estuche 8×18', product_type: 'caja_plegadiza',
	  width_cm: 8, height_cm: 18, cavities: 4, shelf_location: 'A-5', exclusive: false,
	  acquisition_cost: 318_000, status: 'activo', times_used: 12 },
	{ code: 'TR-114', name: 'Estuche 15×22', product_type: 'caja_plegadiza',
	  width_cm: 15, height_cm: 22, cavities: 2, shelf_location: 'A-6', exclusive: false,
	  acquisition_cost: 352_000, status: 'activo', times_used: 7 },
	{ code: 'TR-115', name: 'Carpeta 22×31', product_type: 'carpeta',
	  width_cm: 22, height_cm: 31, cavities: 1, shelf_location: 'D-1', exclusive: false,
	  acquisition_cost: 395_000, status: 'activo', times_used: 5 },
	{ code: 'TR-116', name: 'Sobre 11×22', product_type: 'sobre',
	  width_cm: 11, height_cm: 22, cavities: 3, shelf_location: 'D-2', exclusive: false,
	  acquisition_cost: 288_000, status: 'activo', times_used: 8 },
	{ code: 'TR-117', name: 'Bolsa 18×24', product_type: 'bolsa',
	  width_cm: 18, height_cm: 24, cavities: 1, shelf_location: 'D-3', exclusive: false,
	  acquisition_cost: 430_000, status: 'activo', times_used: 3 },
	{ code: 'TR-118', name: 'Colgante 5×9', product_type: 'otro',
	  width_cm: 5, height_cm: 9, cavities: 20, shelf_location: 'B-7', exclusive: false,
	  acquisition_cost: 250_000, status: 'activo', times_used: 16 },

	// ── La cola muerta: comprados una vez y nunca reutilizados ───────────────
	//
	// Son la evidencia de por qué esta funcionalidad existe. Sin ellos el estante
	// se ve sano y nadie cambia de política.
	{ code: 'TR-119', name: 'Estuche 13×27 · especial', product_type: 'caja_plegadiza',
	  width_cm: 13, height_cm: 27, cavities: 2, shelf_location: 'E-1', exclusive: true,
	  acquisition_cost: 365_000, status: 'activo', times_used: 1, cliente: 1 },
	{ code: 'TR-120', name: 'Caja display 24×36 · especial', product_type: 'caja_display',
	  width_cm: 24, height_cm: 36, cavities: 1, shelf_location: 'E-2', exclusive: true,
	  acquisition_cost: 480_000, status: 'activo', times_used: 1, cliente: 2 },
	{ code: 'TR-121', name: 'Etiqueta 8,5×11,5', product_type: 'etiqueta',
	  width_cm: 8.5, height_cm: 11.5, cavities: 8, shelf_location: 'E-3', exclusive: false,
	  acquisition_cost: 292_000, status: 'activo', times_used: 1 },
	{ code: 'TR-122', name: 'Estuche 9×29 · promoción', product_type: 'caja_plegadiza',
	  width_cm: 9, height_cm: 29, cavities: 3, shelf_location: 'E-4', exclusive: true,
	  acquisition_cost: 344_000, status: 'activo', times_used: 1, cliente: 3 },
	{ code: 'TR-123', name: 'Troquel muestra 30×40', product_type: 'otro',
	  width_cm: 30, height_cm: 40, cavities: 1, shelf_location: 'E-5', exclusive: false,
	  acquisition_cost: 510_000, status: 'activo', times_used: 0,
	  notes: 'Se mandó a hacer para una licitación que no se ganó. Nunca se usó.' },
	{ code: 'TR-124', name: 'Estuche 16×16 · descontinuado', product_type: 'caja_plegadiza',
	  width_cm: 16, height_cm: 16, cavities: 2, shelf_location: 'E-6', exclusive: true,
	  acquisition_cost: 358_000, status: 'activo', times_used: 0, cliente: 4,
	  notes: 'El cliente descontinuó el producto un mes después de aprobarlo.' },
];

async function main() {
	const clientes = await leer<{ id: string; name: string }>('clients?select=id,name&limit=10');
	if (clientes.length === 0) {
		console.error('No hay clientes. Corré primero `npm run seed:demo -- --write`.');
		process.exit(1);
	}

	const filas = ESTANTE.map((d) => ({
		code: d.code,
		name: d.name,
		product_type: d.product_type,
		width_cm: d.width_cm,
		height_cm: d.height_cm,
		cavities: d.cavities,
		shelf_location: d.shelf_location,
		// Los exclusivos se atan a un cliente real; el resto queda genérico.
		client_id: d.cliente != null ? clientes[d.cliente % clientes.length].id : null,
		exclusive: d.exclusive,
		acquisition_cost: d.acquisition_cost,
		// Antigüedad repartida: un estante donde todo se compró el mismo día no
		// se parece a ningún taller.
		acquired_on: new Date(Date.now() - (60 + d.times_used * 11) * 86_400_000)
			.toISOString()
			.slice(0, 10),
		status: d.status,
		times_used: d.times_used,
		last_used_at:
			d.times_used > 0
				? new Date(Date.now() - Math.round(400 / (d.times_used + 1)) * 86_400_000).toISOString()
				: null,
		notes: d.notes ?? null,
	}));

	const invertido = filas.reduce((a, f) => a + f.acquisition_cost, 0);
	const muertos = filas.filter((f) => f.times_used <= 1).length;

	console.log(`\nEstante: ${filas.length} troqueles`);
	console.log(`  invertido:            $${invertido.toLocaleString('es-CL')}`);
	console.log(`  usados 1 vez o menos: ${muertos} ($${filas
		.filter((f) => f.times_used <= 1)
		.reduce((a, f) => a + f.acquisition_cost, 0)
		.toLocaleString('es-CL')} parados)`);
	console.log(`  activos:              ${filas.filter((f) => f.status === 'activo').length}`);

	if (!ESCRIBIR) {
		console.log('\nEnsayo. Volvé a correr con --write para escribirlo.\n');
		return;
	}

	// Idempotente: el estante se reemplaza entero, no se acumula. Volver a
	// correr esto dos veces tiene que dejar el mismo estante, no el doble.
	await borrar('dies', 'code=like.TR-*');
	await insertar('dies', filas);

	console.log(`\nEscrito. dies = ${await contar('dies')}\n`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
