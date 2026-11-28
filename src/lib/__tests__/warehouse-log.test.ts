import { describe, expect, it } from 'vitest';
import { insertWarehouseLog } from '../warehouse-log';

/**
 * Bodega deduplicaba con una ventana de 60 segundos (mismo ítem, operador y
 * acción). Meta reintenta minutos después cuando el ack se pierde: la segunda
 * entrega pasaba la ventana y dejaba otro movimiento pendiente — aprobar los
 * dos movía el stock dos veces. La llave real es el wamid, con un índice único
 * parcial (20261127120000), igual que producción.
 *
 * El doble reproduce ese índice: una fila por `external_message_id` no nulo; la
 * segunda inserción falla con 23505, como Postgres.
 */
function base() {
	const filas: { id: string; external_message_id: string | null }[] = [];
	const db = {
		from: (_t: string) => ({
			insert: (row: { external_message_id?: string | null }) => ({
				select: () => ({
					single: async () => {
						const k = row.external_message_id ?? null;
						if (k != null && filas.some((f) => f.external_message_id === k)) {
							return { data: null, error: { code: '23505', message: 'duplicate key value' } };
						}
						const id = `log-${filas.length + 1}`;
						filas.push({ id, external_message_id: k });
						return { data: { id }, error: null };
					},
				}),
			}),
			select: () => ({
				eq: (_c: string, v: string) => ({
					maybeSingle: async () => ({ data: filas.find((f) => f.external_message_id === v) ?? null, error: null }),
				}),
			}),
		}),
	};
	return { db, filas };
}

const fila = { operator_phone: '+56911110001', raw_message: 'recibo 10 kg', review_status: 'pending' } as const;

describe('insertWarehouseLog', () => {
	it('la reentrega del mismo wamid, minutos después, no crea otro movimiento', async () => {
		const { db, filas } = base();
		const a = await insertWarehouseLog(db as any, fila as any, 'wamid.X');
		const b = await insertWarehouseLog(db as any, fila as any, 'wamid.X');
		expect(a).toEqual({ ok: true, id: 'log-1', duplicate: false });
		expect(b).toEqual({ ok: true, id: 'log-1', duplicate: true });
		expect(filas).toHaveLength(1);
	});

	it('sin wamid (simulador, proveedor genérico) inserta siempre', async () => {
		const { db, filas } = base();
		await insertWarehouseLog(db as any, fila as any, null);
		await insertWarehouseLog(db as any, fila as any, null);
		expect(filas).toHaveLength(2);
	});

	it('otro error de la base no se disfraza de duplicado', async () => {
		const db = {
			from: () => ({
				insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23502', message: 'null value' } }) }) }),
			}),
		};
		const r = await insertWarehouseLog(db as any, fila as any, 'wamid.Y');
		expect(r).toEqual({ ok: false, error: 'null value' });
	});
});
