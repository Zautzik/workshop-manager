/**
 * Papel parado en bodega.
 *
 * El seed original creó lotes de las últimas dos semanas, todos con destino.
 * Un taller real no se ve así: siempre hay papel de hace meses que sobró de un
 * tiraje, que se compró de más, o que quedó de un trabajo que se cayó después
 * de la compra.
 *
 * Sin ese papel la funcionalidad de sustitución no se puede mostrar — y peor,
 * no se puede probar que ordena bien: lo interesante es que un couché 130 de
 * hace tres meses aparezca ANTES que un 120 exacto de la semana pasada.
 *
 * Los casos están elegidos para que cada uno ejercite una regla distinta:
 *
 *   · el 130 de hace 3 meses      → el caso del enunciado: sube 10 g y es viejo
 *   · un 120 exacto reciente      → tiene que quedar DEBAJO del anterior
 *   · un 110 para bajar           → oferta de ahorro, si el producto aguanta
 *   · un 200 fuera de rango       → no se ofrece: ya es otro producto
 *   · una cartulina de otra familia → no cruza aunque el gramaje calce
 *
 * Ejecutar:  npx tsx scripts/seed/papel-parado.ts --write
 */

import { borrar, insertar, leer, llamar } from './db';

const ESCRIBIR = process.argv.includes('--write');

/** Marca para poder resembrar sin acumular. */
const MARCA = 'PARADO';

interface Item {
	id: string;
	name: string;
	grammage_gsm: number | null;
	sheet_width_cm: number | null;
}

const hace = (dias: number) =>
	new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

async function main() {
	const items = await leer<Item>(
		'inventory_items?category=eq.product_input&grammage_gsm=not.is.null&select=id,name,grammage_gsm,sheet_width_cm&limit=40',
	);

	const buscar = (frag: string, g: number) =>
		items.find(
			(i) => i.name.toLowerCase().includes(frag) && Number(i.grammage_gsm) === g,
		);

	// Se usa lo que el catálogo ya tiene; no se inventan materiales nuevos, que
	// sería sembrar un catálogo falso además de un inventario falso.
	const CASOS = [
		{ frag: 'couche', g: 150, dias: 96, cantidad: 4200, nota: 'Sobrante de un tiraje de etiquetas que se acortó.' },
		{ frag: 'couche', g: 115, dias: 8, cantidad: 6000, nota: 'Compra reciente, con destino.' },
		{ frag: 'cartulina', g: 300, dias: 132, cantidad: 2800, nota: 'El cliente descontinuó el producto después de comprar el papel.' },
		{ frag: 'cartulina', g: 350, dias: 71, cantidad: 1600, nota: 'Quedó de un estuche que se hizo en 400.' },
		{ frag: 'bond', g: 75, dias: 190, cantidad: 900, nota: 'Papel de un trabajo que nunca volvió a pedirse.' },
	];

	const filas = CASOS.map((c) => {
		const item = buscar(c.frag, c.g);
		return item ? { ...c, item } : null;
	}).filter((x): x is NonNullable<typeof x> => x !== null);

	console.log(`\n${filas.length} lotes de papel parado:\n`);
	for (const f of filas) {
		const meses = Math.round(f.dias / 30);
		console.log(
			`  ${f.item.name.padEnd(28)} ${String(f.cantidad).padStart(6)} pliegos · ` +
				`${f.dias >= 60 ? `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}` : `hace ${f.dias} días`}`,
		);
	}

	if (!ESCRIBIR) {
		console.log('\nEnsayo. Volvé a correr con --write.\n');
		return;
	}

	const previas = await leer<{ id: string }>(
		`inventory_lots?lot_number=like.*${MARCA}*&select=id`,
	);
	for (const p of previas) await borrar('inventory_lots', `id=eq.${p.id}`);
	if (previas.length) console.log(`\nSe reemplazan ${previas.length} anteriores.`);

	for (const f of filas) {
		// Directo a la tabla y no por `receive_oc_into_lot`: estos lotes no
		// vienen de una OC de este mes, vienen de hace medio año. Hacerlos pasar
		// por una recepción inventaría una compra que nunca ocurrió.
		const lote = `L-${MARCA}-${String(f.item.grammage_gsm)}-${f.dias}`;
		await insertar('inventory_lots', [
			{
				item_id: f.item.id,
				lot_number: lote,
				supplier_name: 'Papeles Bío Bío',
				received_date: hace(f.dias),
				unit_cost: 1800 + Number(f.item.grammage_gsm) * 4,
				quantity_received: f.cantidad,
				quantity_available: f.cantidad,
				certification_code: `CERT-${900 + f.dias}`,
				// Vigente: el punto de estos lotes es que se PUEDAN usar. Un
				// certificado vencido los sacaría de la sugerencia y taparía lo que
				// se quiere mostrar.
				certification_expires_on: hace(-400),
				// `inventory_lots` no tiene columna de notas y no vale la pena
				// agregarle una para prosa de sembrador: el porqué de cada lote se
				// imprime en consola, que es donde alguien lo va a leer.
			},
		]);
		console.log(`  ✓ ${lote}`);
	}

	console.log('');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
