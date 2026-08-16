'use client';

import { QRCodeSVG } from 'qrcode.react';

import { encodeLotQR, esNumeroPropio } from '@/lib/traceability';

export interface LoteImprimible {
	id: string;
	lot_number: string;
	quantity_received: number;
	received_date: string | null;
	supplier_name: string | null;
	certification_code: string | null;
	certification_expires_on: string | null;
	inventory_items?: { name?: string | null; sku?: string | null; unit?: string | null } | null;
	purchases?: { oc_number?: string | null } | null;
}

/**
 * La etiqueta que se pega en el pallet.
 *
 * Es el único objeto de todo el sistema que vive en el galpón: se moja, se
 * raspa, se lee a dos metros y con poca luz. Eso manda todo el diseño.
 *
 * ── Por qué lleva texto y no sólo el código ─────────────────────────────────
 *
 * Un QR solo obliga a sacar el teléfono para saber qué hay en ese pallet. En
 * bodega eso no pasa: se mira y se sigue caminando. El número de lote va
 * grande, el material y el proveedor legibles, y el QR queda para el momento en
 * que hay que registrar algo.
 *
 * ── Por qué imprime la FECHA y no «vigente» ─────────────────────────────────
 *
 * Una etiqueta es papel: se imprime una vez y se queda pegada meses. Estampar
 * «Certificado vigente» imprime una FOTO —cierta el día que salió de la
 * impresora— sobre algo que va a seguir ahí cuando el certificado venza. La
 * etiqueta terminaría contradiciendo al sistema, y frente a un auditor el
 * papel pegado al pallet gana.
 *
 * La fecha de vencimiento es verdad permanente: dice lo mismo hoy que en seis
 * meses, y quien la lee saca la conclusión con el calendario de hoy y no con
 * el del día que se imprimió. Lo mismo vale para el vencido: no hace falta
 * escribir «NO USAR», porque quien lo verifica de verdad es la máquina cuando
 * se escanea el código.
 */
export function EtiquetaLote({ lote }: { lote: LoteImprimible }) {
	const material = lote.inventory_items?.name ?? 'Material';
	const propio = esNumeroPropio(lote.lot_number);

	const fecha = (v: string | null) =>
		v
			? new Date(v.length <= 10 ? `${v}T00:00:00` : v).toLocaleDateString('es-CL', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
				})
			: '—';

	return (
		<article className="etiqueta flex w-[105mm] flex-col gap-2 border-2 border-black bg-white p-3 text-black">
			<header className="flex items-start justify-between gap-2 border-b-2 border-black pb-1.5">
				<div className="min-w-0">
					{/* El número, tan grande como quepa: es lo que se dicta por radio
					    y lo que se anota en un cuaderno cuando el sistema no está. */}
					<p className="font-mono text-[26px] font-bold leading-none tracking-tight">
						{lote.lot_number}
					</p>
					<p className="mt-0.5 text-[9px] uppercase tracking-widest text-gray-600">
						{propio ? 'Lote interno' : 'Lote del proveedor'}
					</p>
				</div>
				<QRCodeSVG value={encodeLotQR(lote.id)} size={70} level="M" marginSize={0} />
			</header>

			<div className="min-w-0">
				<p className="truncate text-[15px] font-semibold leading-tight">{material}</p>
				<p className="text-[10px] text-gray-700">
					{lote.quantity_received?.toLocaleString('es-CL')} {lote.inventory_items?.unit ?? 'un'}
					{lote.supplier_name ? ` · ${lote.supplier_name}` : ''}
				</p>
			</div>

			<dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
				<div className="flex justify-between border-b border-gray-300">
					<dt className="text-gray-600">Recibido</dt>
					<dd className="font-medium">{fecha(lote.received_date)}</dd>
				</div>
				<div className="flex justify-between border-b border-gray-300">
					<dt className="text-gray-600">OC</dt>
					<dd className="font-mono font-medium">{lote.purchases?.oc_number ?? '—'}</dd>
				</div>
				<div className="flex justify-between border-b border-gray-300">
					<dt className="text-gray-600">Certificado</dt>
					<dd className="truncate font-mono font-medium">{lote.certification_code ?? '—'}</dd>
				</div>
				<div className="flex justify-between border-b border-gray-300">
					<dt className="text-gray-600">Vence</dt>
					<dd className="font-medium">{fecha(lote.certification_expires_on)}</dd>
				</div>
			</dl>

			{/* La franja del vencimiento. Dice la FECHA, que no caduca como
			    afirmación, y deja la conclusión al calendario de quien la lee.
			    Sin certificado sí se estampa, porque eso no cambia con el tiempo. */}
			<p className="border-t-2 border-black pt-1 text-center text-[11px] font-bold uppercase tracking-wide">
				{lote.certification_expires_on
					? `Certificado válido hasta ${fecha(lote.certification_expires_on)}`
					: 'SIN CERTIFICADO'}
			</p>
		</article>
	);
}
