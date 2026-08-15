/**
 * Órdenes de compra con las diferencias que hacen falta ver.
 *
 * El seed original creó todo calzando perfecto: pedido = recibido = facturado
 * en todas las OC. Una pantalla de conciliación donde todo da cero no demuestra
 * que el control funcione — demuestra que hay una tabla.
 *
 * Estos casos son los que un jefe de compras reconoce de inmediato, y cada uno
 * ejercita una parte distinta del sistema:
 *
 *   · borrador sin emitir      → todavía no gastó correlativo
 *   · emitida sin recibir      → el proveedor no ha despachado
 *   · llegó de menos, facturan todo   → EL CASO CARO, bloquea el pago
 *   · llegó completo, facturan de más → error del proveedor
 *   · certificado vencido      → no puede entrar a producción
 *   · anulada con motivo       → conserva el número
 *
 * Ejecutar:  npx tsx scripts/seed/compras.ts --write
 */

import { borrar, insertar, leer, llamar, uuid } from './db';

const ESCRIBIR = process.argv.includes('--write');

/** Marca para poder resembrar sin acumular. */
const MARCA = '[demo-conciliación]';

interface OT {
	id: string;
	ot_number: string;
	client_name: string | null;
}
interface Item {
	id: string;
	name: string;
	unit: string | null;
}

async function main() {
	const ots = await leer<OT>('ots?select=id,ot_number,client_name&limit=8&order=created_at.desc');
	const items = await leer<Item>('inventory_items?select=id,name,unit&limit=5');

	if (ots.length < 5 || items.length === 0) {
		console.error('Faltan OT o materiales. Corré antes `npm run seed:demo -- --write`.');
		process.exit(1);
	}

	// Una OC emitida sin autor no pasa el CHECK de la base — y está bien que no
	// pase: la atribución es la mitad del valor del documento. El sembrador usa
	// un usuario real igual que lo haría la aplicación.
	const usuarios = await leer<{ user_id: string }>('user_roles?select=user_id&limit=1');
	const autor = usuarios[0]?.user_id ?? null;
	if (!autor) {
		console.error('No hay usuarios en `user_roles`: una OC emitida necesita un autor.');
		process.exit(1);
	}

	const papel = items[0];
	const hoy = new Date();
	const dias = (n: number) => new Date(hoy.getTime() + n * 86_400_000).toISOString().slice(0, 10);

	/** Cada caso: la OC, su línea, lo que llegó y lo que facturaron. */
	const CASOS = [
		{
			nombre: 'Borrador sin emitir',
			oc: { status: 'draft', total_cost: 1_240_000, supplier: 'Papeles Bío Bío' },
			linea: { quantity: 620, unit_cost: 2000 },
			recibir: null,
			facturar: null,
		},
		{
			nombre: 'Emitida, el proveedor no despachó',
			oc: { status: 'sent', total_cost: 890_000, supplier: 'Cartulinas del Sur' },
			linea: { quantity: 445, unit_cost: 2000 },
			recibir: null,
			facturar: null,
		},
		{
			// El caso que justifica todo el calce a tres bandas.
			nombre: 'Llegó de menos y facturan lo pedido',
			oc: { status: 'sent', total_cost: 1_000_000, supplier: 'Papeles Bío Bío' },
			linea: { quantity: 500, unit_cost: 2000 },
			recibir: { quantity: 480, cert_expires: dias(180), motivo: 'El proveedor despachó 480: no tenía stock del resto.' },
			facturar: { amount: 1_000_000, net: 840_336, vat: 159_664 },
		},
		{
			nombre: 'Llegó completo y facturan de más',
			oc: { status: 'sent', total_cost: 600_000, supplier: 'Distribuidora Andes' },
			linea: { quantity: 300, unit_cost: 2000 },
			recibir: { quantity: 300, cert_expires: dias(240), motivo: null },
			facturar: { amount: 714_000, net: 600_000, vat: 114_000 },
		},
		{
			// El certificado vencido queda en el lote: la pantalla lo tiene que
			// marcar aunque el material ya haya entrado con autorización.
			nombre: 'Recibido con certificado vencido, autorizado',
			oc: { status: 'sent', total_cost: 450_000, supplier: 'Cartulinas del Sur' },
			linea: { quantity: 225, unit_cost: 2000 },
			recibir: {
				quantity: 225,
				cert_expires: dias(-12),
				motivo: null,
				override: 'Autoriza Jefe de Calidad: el proveedor envió el certificado renovado por correo, llega firmado el lunes.',
			},
			facturar: null,
		},
	];

	console.log(`\n${CASOS.length} órdenes de compra de demostración:\n`);
	for (const c of CASOS) {
		console.log(`  · ${c.nombre}`);
	}

	if (!ESCRIBIR) {
		console.log('\nEnsayo. Volvé a correr con --write.\n');
		return;
	}

	// Idempotente: se borran las anteriores por su marca en las notas.
	const previas = await leer<{ id: string }>(
		`purchases?notes=like.*${encodeURIComponent(MARCA)}*&select=id`,
	);
	for (const p of previas) {
		await borrar('purchase_items', `purchase_id=eq.${p.id}`);
		await borrar('purchase_invoices', `purchase_id=eq.${p.id}`);
		await borrar('inventory_lots', `purchase_id=eq.${p.id}`);
		await borrar('purchases', `id=eq.${p.id}`);
	}
	if (previas.length) console.log(`\nSe reemplazan ${previas.length} anteriores.`);

	let i = 0;
	for (const c of CASOS) {
		const ot = ots[i % ots.length];
		const id = uuid();

		// Se insertan directo en el estado final del caso. Las OC ya emitidas
		// llevan número y firma porque el CHECK de la base las exige — pasar por
		// `emitir_oc` una por una no aportaría nada acá.
		const emitida = c.oc.status !== 'draft';
		await insertar('purchases', [
			{
				id,
				ot_id: ot.id,
				supplier: c.oc.supplier,
				supplier_rut: '77.888.999-1',
				status: 'draft', // nace borrador para no pelear con el disparador
				total_cost: c.oc.total_cost,
				purchase_date: dias(-6),
				expected_date: dias(2),
				notes: `${MARCA} ${c.nombre}`,
			},
		]);

		await insertar('purchase_items', [
			{
				purchase_id: id,
				item_id: papel.id,
				description: papel.name,
				quantity: c.linea.quantity,
				unit_cost: c.linea.unit_cost,
			},
		]);

		if (emitida) {
			// Por la función real: así el correlativo sale de la secuencia y la OC
			// queda firmada como cualquier otra.
			await llamar('emitir_oc', { p_purchase_id: id, p_issued_by: autor });
		}

		if (c.recibir) {
			await llamar('receive_oc_into_lot', {
				p_purchase_id: id,
				p_item_id: papel.id,
				p_quantity: c.recibir.quantity,
				p_unit_cost: c.linea.unit_cost,
				p_lot_number: null,
				p_cert_code: `CERT-${1000 + i}`,
				p_cert_expires: c.recibir.cert_expires,
				p_recorded_by: null,
				p_variance_reason: c.recibir.motivo,
				p_cert_override_reason: (c.recibir as { override?: string }).override ?? null,
			});
		}

		if (c.facturar) {
			await insertar('purchase_invoices', [
				{
					purchase_id: id,
					invoice_number: `${41_000 + i}`,
					issuer_rut: '77.888.999-1',
					invoice_date: dias(-1),
					amount: c.facturar.amount,
					net: c.facturar.net,
					vat: c.facturar.vat,
					status: 'received',
				},
			]);
		}

		console.log(`  ✓ ${c.nombre} → ${ot.ot_number}`);
		i++;
	}

	const conc = await leer<Record<string, number | string>>(
		'oc_conciliacion?select=oc_number,pedido,recibido,facturado,brecha_recepcion,brecha_facturacion,certificados_vencidos&order=issued_at.desc&limit=6',
	);
	console.log('\nConciliación resultante:');
	for (const c of conc) {
		console.log(
			`  ${String(c.oc_number ?? 'borrador').padEnd(10)} ` +
				`pedido ${String(c.pedido).padStart(9)} · recibido ${String(c.recibido).padStart(9)} · ` +
				`facturado ${String(c.facturado).padStart(9)} · ` +
				`brechas ${String(c.brecha_recepcion)}/${String(c.brecha_facturacion)}` +
				(Number(c.certificados_vencidos) > 0 ? '  ⚠ cert vencido' : ''),
		);
	}
	console.log('');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
