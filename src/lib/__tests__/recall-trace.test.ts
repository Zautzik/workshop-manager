import { describe, expect, it } from 'vitest';

import {
	agruparLotes,
	alcance,
	revisarCadena,
	type Consumo,
	type LoteEnLaCadena,
	type OTAfectada,
	type TraceBackward,
} from '../recall-trace';

const consumo = (extra: Partial<Consumo> = {}): Consumo => ({
	lotId: 'l1',
	lotNumber: 'L-2608-0001',
	material: 'Cartulina 300 g',
	quantity: 500,
	consumedAt: '2026-08-10T10:00:00Z',
	authorizedDeviation: false,
	...extra,
});

const lote = (extra: Partial<LoteEnLaCadena> = {}): LoteEnLaCadena => ({
	lotId: 'l1',
	lotNumber: 'L-2608-0001',
	material: 'Cartulina 300 g',
	supplier: 'Papeles Bío Bío',
	ocNumber: 'OC-00021',
	certificationCode: 'CERT-1001',
	certificationExpiresOn: '2027-01-01',
	receivedDate: '2026-08-01',
	quantityInSubject: 500,
	deviationAtUse: false,
	...extra,
});

const ot = (extra: Partial<OTAfectada> = {}): OTAfectada => ({
	otId: 'o1',
	otNumber: '41221',
	clientName: 'Salmones Chaicura',
	status: 'completed',
	guides: [{ guideNumber: 'G-0044', dispatchDate: '2026-08-12', quantity: 3000 }],
	...extra,
});

describe('agruparLotes', () => {
	// Un lote consumido tres veces es UN lote con la suma. Listarlo tres veces
	// obliga a sumar a mano justo cuando no hay tiempo.
	it('suma los consumos repetidos del mismo lote', () => {
		const detalles = new Map([['l1', lote()]]);
		const r = agruparLotes(
			[consumo({ quantity: 500 }), consumo({ quantity: 300 }), consumo({ quantity: 200 })],
			detalles,
		);
		expect(r).toHaveLength(1);
		expect(r[0].quantityInSubject).toBe(1000);
	});

	// Basta que UNA salida haya sido con desviación para que el lote quede
	// marcado: es lo que hay que documentar.
	it('una sola desviación marca el lote entero', () => {
		const detalles = new Map([['l1', lote()]]);
		const r = agruparLotes(
			[consumo({ authorizedDeviation: false }), consumo({ authorizedDeviation: true })],
			detalles,
		);
		expect(r[0].deviationAtUse).toBe(true);
	});

	it('ordena por cuánto entró: lo que más pesa se mira primero', () => {
		const detalles = new Map([['l1', lote()], ['l2', lote({ lotId: 'l2', lotNumber: 'L-2608-0002' })]]);
		const r = agruparLotes(
			[consumo({ lotId: 'l1', quantity: 100 }), consumo({ lotId: 'l2', quantity: 900 })],
			detalles,
		);
		expect(r[0].lotId).toBe('l2');
	});

	it('un lote sin detalle no se pierde de la cadena', () => {
		const r = agruparLotes([consumo({ lotId: 'huérfano' })], new Map());
		expect(r).toHaveLength(1);
		expect(r[0].lotNumber).toBe('(desconocido)');
	});
});

describe('revisarCadena', () => {
	it('una cadena completa no genera avisos', () => {
		expect(revisarCadena({ ots: [ot()], lots: [lote()] })).toEqual([]);
	});

	// El caso más grave y el más fácil de pasar por alto: la OT existe, se
	// fabricó, y nadie registró de qué papel.
	it('avisa cuando la OT existe y no hay material trazado', () => {
		const a = revisarCadena({ ots: [ot()], lots: [] });
		expect(a[0]).toContain('no se puede saber de qué lote salieron');
	});

	it('nombra los lotes sin certificado', () => {
		const a = revisarCadena({ ots: [ot()], lots: [lote({ certificationCode: null })] });
		expect(a.join(' ')).toContain('sin certificado registrado');
		expect(a.join(' ')).toContain('L-2608-0001');
	});

	it('pide la autorización de las desviaciones', () => {
		const a = revisarCadena({ ots: [ot()], lots: [lote({ deviationAtUse: true })] });
		expect(a.join(' ')).toContain('desviación autorizada');
	});

	it('marca el lote que no cuelga de ninguna OC', () => {
		const a = revisarCadena({ ots: [ot()], lots: [lote({ ocNumber: null })] });
		expect(a.join(' ')).toContain('eslabón hacia el proveedor');
	});

	// Lo que todavía no salió se puede retener: es la acción más barata.
	it('señala lo que todavía no se despachó', () => {
		const a = revisarCadena({
			ots: [ot(), ot({ otId: 'o2', otNumber: '41222', guides: [] })],
			lots: [lote()],
		});
		expect(a.join(' ')).toContain('todavía no se despacharon');
	});

	it('sin órdenes lo dice y no sigue', () => {
		expect(revisarCadena({ ots: [], lots: [] })).toHaveLength(1);
	});
});

describe('alcance', () => {
	const base: TraceBackward = {
		subject: { kind: 'guia', label: 'G-0044' },
		ots: [ot()],
		lots: [lote()],
		blastRadius: [],
		clientsReached: ['Salmones Chaicura'],
		warnings: [],
	};

	// Lo que define si se retira o no es cuántos CLIENTES recibieron producto,
	// no cuántos lotes hay.
	it('cuenta clientes, no lotes', () => {
		const t = {
			...base,
			blastRadius: [ot({ otId: 'o2', otNumber: '41230', clientName: 'Aceites Trumao' })],
			clientsReached: ['Salmones Chaicura', 'Aceites Trumao'],
		};
		expect(alcance(t)).toContain('2 clientes en total');
		expect(alcance(t)).toContain('1 orden más');
	});

	it('dice cuando el material no salió a ningún otro trabajo', () => {
		expect(alcance(base)).toContain('no se usó en ningún otro trabajo');
	});

	it('sin material trazado no inventa un alcance', () => {
		expect(alcance({ ...base, lots: [] })).toBe('Sin material trazado.');
	});
});
