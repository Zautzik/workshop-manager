#!/usr/bin/env node
/**
 * Regression check: a manual inventory movement must not be able to consume
 * material another OT has reserved — even when two such movements race for
 * the same lot at the same instant.
 *
 * Exercises supabase/migrations/20260905120000_reserva_protege_todo_movimiento.sql
 * directly against `inventory_stock_transactions` (the same table
 * POST /api/inventory/transactions writes to), so it validates the trigger
 * fix without needing the Next.js app running.
 *
 * Background: /api/lots/scan (QR scan) goes through consumir_lote(), which
 * already respects inventory_reservations. The admin panel's manual
 * "Crear movimiento de stock" (POST /api/inventory/transactions) inserts
 * into inventory_stock_transactions directly and never called consumir_lote
 * — the only guard was sync_inventory_lot_quantities(), which checked
 * quantity_available but had never heard of inventory_reservations. Two
 * people acting on the same lot at once (one holding a reservation, one
 * logging a manual consumption against the same lot for a different OT)
 * could siphon off committed stock. The fix moves the reservation check
 * into that trigger, so it applies no matter which path wrote the row.
 *
 * SAFETY: writes and deletes real rows. Refuses to run against anything
 * that isn't localhost/127.0.0.1 — never point this at a shared/remote
 * Supabase project.
 *
 * Requires a local Supabase stack: `npx supabase start`, with
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (`npx supabase status` prints both).
 *
 * Usage: node scripts/verify-lot-reservation-race.mjs
 * Exit:  0 pass, 1 fail
 */

import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function leerEnv() {
	const archivo = path.join(raiz, '.env.local');
	const texto = fs.readFileSync(archivo, 'utf8');
	return Object.fromEntries(
		texto
			.split('\n')
			.filter((l) => l.includes('=') && !l.trim().startsWith('#'))
			.map((l) => {
				const i = l.indexOf('=');
				return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
			}),
	);
}

const env = leerEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !LLAVE) {
	console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
	process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(URL_BASE)) {
	console.error(
		`Este script inserta y BORRA filas de prueba. NEXT_PUBLIC_SUPABASE_URL (${URL_BASE}) no es local — abortando por seguridad.`,
	);
	process.exit(1);
}

const headers = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'application/json' };

async function post(tabla, fila) {
	const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
		method: 'POST',
		headers: { ...headers, Prefer: 'return=representation' },
		body: JSON.stringify(fila),
	});
	const text = await res.text();
	let json = null;
	try { json = JSON.parse(text); } catch { /* not json */ }
	return { ok: res.ok, status: res.status, json, text };
}

async function rpc(nombre, args) {
	const res = await fetch(`${URL_BASE}/rest/v1/rpc/${nombre}`, { method: 'POST', headers, body: JSON.stringify(args) });
	const text = await res.text();
	let json = null;
	try { json = JSON.parse(text); } catch { /* not json */ }
	return { ok: res.ok, status: res.status, json, text };
}

async function get(consulta) {
	const res = await fetch(`${URL_BASE}/rest/v1/${consulta}`, { headers });
	if (!res.ok) throw new Error(`GET ${consulta} -> ${res.status} ${await res.text()}`);
	return res.json();
}

async function del(tabla, filtro) {
	await fetch(`${URL_BASE}/rest/v1/${tabla}?${filtro}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } });
}

const sufijo = Date.now().toString(36);
let fail = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

async function main() {
	console.log('\n■ Reserva vs. movimiento manual concurrente\n');

	const item = await post('inventory_items', {
		sku: `TEST-RACE-${sufijo}`,
		name: `[TEST] Papel de prueba ${sufijo}`,
		category: 'product_input',
		unit: 'hojas',
	});
	if (!item.ok) return bad(`crear item -> ${item.status} ${item.text}`);
	const itemId = item.json[0].id;
	ok(`item de prueba creado (${itemId})`);

	const lot = await post('inventory_lots', {
		item_id: itemId,
		lot_number: `L-TEST-${sufijo}`,
		quantity_received: 100,
		quantity_available: 100,
		unit_cost: 10,
	});
	if (!lot.ok) return bad(`crear lote -> ${lot.status} ${lot.text}`);
	const lotId = lot.json[0].id;
	ok(`lote de prueba creado con 100 disponibles (${lotId})`);

	const otA = await post('ots', { ot_number: `TEST-RACE-A-${sufijo}`, client_name: '[TEST] Cliente A' });
	const otB = await post('ots', { ot_number: `TEST-RACE-B-${sufijo}`, client_name: '[TEST] Cliente B' });
	if (!otA.ok) return bad(`crear OT-A -> ${otA.status} ${otA.text}`);
	if (!otB.ok) return bad(`crear OT-B -> ${otB.status} ${otB.text}`);
	const otAId = otA.json[0].id;
	const otBId = otB.json[0].id;
	ok('dos OTs de prueba creadas');

	// OT-A reserva 80 de los 100 disponibles. Libre para cualquier otra OT: 20.
	const reserva = await rpc('reservar_lote', { p_lot_id: lotId, p_ot_id: otAId, p_quantity: 80 });
	if (!reserva.ok) return bad(`reservar_lote -> ${reserva.status} ${reserva.text}`);
	ok('OT-A reserva 80/100 -> quedan 20 libres para cualquier otra OT');

	// Dos movimientos MANUALES (el camino que no pasa por consumir_lote) contra
	// OT-B, 15 cada uno. Ninguno excede el saldo bruto (100) por sí solo, pero
	// juntos (30) exceden lo LIBRE (20) -- la condición que el trigger viejo no
	// sabía mirar. Se disparan a la vez: la protección tiene que sostenerse bajo
	// dos transacciones compitiendo por el mismo lote, no sólo con una sola.
	const movimiento = () =>
		post('inventory_stock_transactions', {
			item_id: itemId,
			lot_id: lotId,
			tx_type: 'consumption',
			quantity: 15,
			work_order_id: otBId,
			reference_code: `TEST-RACE-${sufijo}`,
		});

	const [r1, r2] = await Promise.all([movimiento(), movimiento()]);
	const exitos = [r1, r2].filter((r) => r.ok);
	const rechazos = [r1, r2].filter((r) => !r.ok);

	if (exitos.length === 1 && rechazos.length === 1) {
		ok('exactamente uno de los dos movimientos concurrentes se aceptó');
	} else {
		bad(`se esperaba 1 aceptado / 1 rechazado; se obtuvo ${exitos.length} aceptado(s) / ${rechazos.length} rechazado(s)`);
		console.error('    r1:', r1.status, r1.text);
		console.error('    r2:', r2.status, r2.text);
	}

	if (rechazos.length > 0) {
		if (/committed to other work orders/i.test(rechazos[0].text)) {
			ok('el rechazo es por la reserva, con el mensaje esperado');
		} else {
			bad(`el rechazo no menciona la reserva -- ¿fue por otro motivo? ${rechazos[0].text}`);
		}
	}

	const [lotFinal] = await get(`inventory_lots?id=eq.${lotId}&select=quantity_available`);
	const esperado = 85; // 100 - 15 del único movimiento que debió entrar
	if (Number(lotFinal.quantity_available) === esperado) {
		ok(`quantity_available terminó en ${esperado} (sólo el movimiento aceptado descontó)`);
	} else {
		bad(`quantity_available terminó en ${lotFinal.quantity_available}, se esperaba ${esperado}`);
	}

	if (fail === 0) {
		await del('inventory_stock_transactions', `reference_code=eq.TEST-RACE-${sufijo}`);
		await del('inventory_reservations', `lot_id=eq.${lotId}`);
		await del('inventory_lots', `id=eq.${lotId}`);
		await del('inventory_items', `id=eq.${itemId}`);
		await del('ots', `id=in.(${otAId},${otBId})`);
		console.log('\n  (filas de prueba borradas)');
	} else {
		console.log(
			`\n  Filas de prueba conservadas para inspección: item=${itemId} lot=${lotId} ot_a=${otAId} ot_b=${otBId}`,
		);
	}
}

const started = Date.now();
await main();
const secs = ((Date.now() - started) / 1000).toFixed(1);
if (fail > 0) {
	console.error(`\nFALLÓ (${fail}) en ${secs}s`);
	process.exit(1);
}
console.log(`\nOK en ${secs}s`);
