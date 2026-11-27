import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Meta entrega al-menos-una-vez, y un solo mensaje (un wamid) puede traer dos
 * eventos: «Fin OT 40879, 7600 pliegos, entro OT 40965» es un FIN y un INICIO.
 *
 * El índice único de `whatsapp_production_logs.external_message_id` es la
 * llave de idempotencia (20260906120000). Si los dos eventos se guardan con el
 * mismo wamid, el segundo choca con el primero y vuelve como «duplicado»: el
 * INICIO se pierde sin que nadie se entere. El simulador no lo muestra porque
 * no trae wamid.
 *
 * El doble de la base reproduce exactamente ese índice: una fila por
 * `p_external_message_id` no nulo; la segunda inserción devuelve la existente
 * con `inserted: false`, como `insert_whatsapp_log_idempotent()`.
 */

const filas = new Map<string, { id: string; type: string }>();
let sinLlave = 0;

function consulta() {
	// Un constructor de consultas que encadena todo y no encuentra nada: ni la
	// OT, ni el empleado, ni un INICIO previo. Lo que se prueba es la llave.
	const q: any = new Proxy(
		{},
		{
			get(_t, prop) {
				if (prop === 'then') return (res: (v: unknown) => void) => res({ data: [], error: null });
				if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: null, error: null });
				return () => q;
			},
		},
	);
	return q;
}

vi.mock('@/integrations/supabase/server', () => ({
	supabaseAdmin: {
		from: () => consulta(),
		rpc: async (fn: string, args: Record<string, any>) => {
			if (fn !== 'insert_whatsapp_log_idempotent') return { data: null, error: null };
			const llave = args.p_external_message_id as string | null;
			if (llave == null) {
				sinLlave++;
				return { data: [{ id: `sin-llave-${sinLlave}`, inserted: true }], error: null };
			}
			const ya = filas.get(llave);
			if (ya) return { data: [{ id: ya.id, inserted: false }], error: null };
			const id = `fila-${filas.size + 1}`;
			filas.set(llave, { id, type: args.p_message_type });
			return { data: [{ id, inserted: true }], error: null };
		},
	},
}));
vi.mock('@/lib/whatsapp-maintenance-ingest', () => ({ tryProcessMaintenanceMessage: async () => null }));

const { processMessage } = await import('../whatsapp-ingest');

const mensaje = (id: string, body: string, from: string) => ({
	from,
	body,
	message_id: id,
	timestamp: '2026-11-27T10:00:00.000Z',
});

const tipos = () => [...filas.values()].map((f) => f.type).sort();

describe('un wamid con FIN + INICIO', () => {
	beforeEach(() => {
		filas.clear();
		sinLlave = 0;
	});

	it('guarda los dos eventos, no sólo el primero', async () => {
		const r = await processMessage(mensaje('wamid.A', 'Fin OT 40879, 7600 pliegos, entro OT 40965', '+56911110001'));
		expect(r.status).toBe(200);
		expect(tipos()).toEqual(['end', 'start']);
		const eventos = (r.payload.events as { status: string }[]) ?? [];
		expect(eventos.map((e) => e.status)).toEqual(['ok', 'ok']);
	});

	it('la reentrega del mismo mensaje no escribe nada nuevo', async () => {
		await processMessage(mensaje('wamid.B', 'Fin OT 40879, 7600 pliegos, entro OT 40965', '+56911110002'));
		const r = await processMessage(mensaje('wamid.B', 'Fin OT 40879, 7600 pliegos, entro OT 40965', '+56911110002'));
		expect(filas.size).toBe(2);
		expect((r.payload.events as { status: string }[]).map((e) => e.status)).toEqual(['duplicate', 'duplicate']);
	});

	it('un mensaje de un solo evento conserva el wamid tal cual (las filas viejas siguen deduplicando)', async () => {
		await processMessage(mensaje('wamid.C', 'entro ot 40965', '+56911110003'));
		expect([...filas.keys()]).toEqual(['wamid.C']);
	});
});
