'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Package, ScanLine, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { materialForPartial } from '@/lib/partial-advance';
import { certStatus, CERT_LABELS } from '@/lib/purchasing';
import { decodeLotQR } from '@/lib/traceability';

export interface ConsumoElegido {
	lotId: string;
	sheets: number;
	qr: string;
	overrideReason: string | null;
}

interface Props {
	movedUnits: number;
	totalUnits: number;
	totalSheets: number;
	makeReadySheets?: number;
	/** Si ya salió un fragmento antes, el arreglo no se vuelve a contar. */
	isFirstFragment?: boolean;
	/** Cambia cada vez que hay algo válido para consumir; `null` si falta algo. */
	onChange: (c: ConsumoElegido | null) => void;
}

interface Lote {
	id: string;
	lot_number: string;
	quantity_available: number;
	certification_expires_on: string | null;
	blocked_reason: string | null;
	inventory_items?: { name?: string | null } | null;
}

/**
 * El papel que se mueve con el fragmento.
 *
 * El diálogo preguntaba «unidades que avanzan» y el material se quedaba quieto:
 * se cortaban tres mil de seis mil y el inventario seguía mostrando los pliegos
 * completos. El papel que físicamente se movió no quedaba descontado ni atado a
 * la OT, así que ese fragmento no tenía trazabilidad — y en un retiro, «la
 * mitad de este trabajo» no es una respuesta.
 *
 * ── Por qué se escanea y no se elige de una lista ───────────────────────────
 *
 * Porque la lista dice qué DEBERÍA salir y el escaneo dice qué SALIÓ. Son
 * distintas más seguido de lo que uno quisiera: el operario agarra el pallet
 * que tiene más a mano, no el que el sistema eligió. Si se registra la
 * intención en vez del hecho, la trazabilidad apunta al lote equivocado, que es
 * peor que no tenerla — porque nadie sospecha de ella.
 *
 * El selector queda igual, para el caso en que el código esté ilegible. Pero el
 * camino corto es apuntar la cámara.
 */
export function MaterialQueAvanza({
	movedUnits,
	totalUnits,
	totalSheets,
	makeReadySheets,
	isFirstFragment,
	onChange,
}: Props) {
	const [qr, setQr] = useState('');
	const [autorizacion, setAutorizacion] = useState('');

	const calculo = materialForPartial({
		movedUnits,
		totalUnits,
		totalSheets,
		makeReadySheets,
		isFirstFragment,
	});

	const { data: lotes = [] } = useQuery({
		queryKey: ['lotes-para-consumo'],
		queryFn: async () => {
			const res = await fetch('/api/inventory/lots?con_saldo=1&limit=200');
			if (!res.ok) return [] as Lote[];
			return ((await res.json()).data ?? []) as Lote[];
		},
	});

	const leido = qr ? decodeLotQR(qr) : null;
	const lote = leido?.ok ? lotes.find((l) => l.id === leido.lotId) : undefined;

	const estadoCert = lote ? certStatus(lote.certification_expires_on) : null;
	const certBloquea = estadoCert === 'vencido' || estadoCert === 'sin_certificado';
	const sinSaldo = !!lote && lote.quantity_available < calculo.sheets;

	useEffect(() => {
		if (!leido?.ok || !lote || sinSaldo || (certBloquea && !autorizacion.trim())) {
			onChange(null);
			return;
		}
		onChange({
			lotId: lote.id,
			sheets: calculo.sheets,
			qr,
			overrideReason: autorizacion.trim() || null,
		});
		// `calculo.sheets` y no el objeto: cambia sólo cuando cambia el número, y
		// pasar el objeto entero reejecutaría el efecto en cada render.
	}, [leido?.ok, lote, sinSaldo, certBloquea, autorizacion, calculo.sheets, qr, onChange]);

	return (
		<div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
			<div className="flex items-start gap-2">
				<Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">
						Papel que sale con este fragmento:{' '}
						<span className="tabular-nums text-primary">
							{calculo.sheets.toLocaleString('es-CL')} pliegos
						</span>
					</p>
					{/* El porqué del número, porque no es la regla de tres que uno
					    espera: el arreglo se gasta una vez y va entero con el primero. */}
					<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{calculo.note}</p>
				</div>
			</div>

			<div>
				<Label htmlFor="qr-consumo" className="flex items-center gap-1.5 text-xs">
					<ScanLine className="h-3 w-3" />
					Escaneá la etiqueta del pallet que estás sacando
				</Label>
				<Input
					id="qr-consumo"
					value={qr}
					onChange={(e) => setQr(e.target.value)}
					placeholder="Código del lote"
					className="h-9 font-mono text-sm"
				/>

				{qr && leido && !leido.ok && (
					<p className="mt-1 text-xs text-red-600 dark:text-red-400">{leido.problem}</p>
				)}
				{leido?.ok && !lote && (
					<p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
						Ese lote no aparece con saldo disponible.
					</p>
				)}
			</div>

			{lote && (
				<div className="rounded-md border border-border bg-card px-2.5 py-2 text-xs">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
						<span className="font-mono font-semibold">{lote.lot_number}</span>
						<span className="text-muted-foreground">{lote.inventory_items?.name}</span>
						<span
							className={`tabular-nums ${sinSaldo ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
						>
							{lote.quantity_available.toLocaleString('es-CL')} disp.
						</span>
						{estadoCert && estadoCert !== 'vigente' && (
							<span
								className={`rounded-full px-1.5 py-0.5 text-[10px] ${
									certBloquea
										? 'bg-red-500/15 text-red-600 dark:text-red-400'
										: 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
								}`}
							>
								{CERT_LABELS[estadoCert]}
							</span>
						)}
					</div>

					{sinSaldo && (
						<p className="mt-1 text-red-600 dark:text-red-400">
							Faltan {(calculo.sheets - lote.quantity_available).toLocaleString('es-CL')} pliegos
							en este lote. Sacá de otro o movés menos unidades.
						</p>
					)}
				</div>
			)}

			{/* La misma puerta que en la pantalla de planta: el certificado puede
			    haber vencido estando el papel en bodega. */}
			{certBloquea && (
				<div className="rounded-md border border-red-500/40 bg-red-500/5 p-2.5">
					<p className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
						<ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
						Este lote no puede entrar a producción sin autorización escrita.
					</p>
					<Textarea
						rows={2}
						value={autorizacion}
						onChange={(e) => setAutorizacion(e.target.value)}
						placeholder="Quién lo autoriza y por qué. Queda a tu nombre."
						className="mt-1.5 text-xs"
					/>
				</div>
			)}
		</div>
	);
}
