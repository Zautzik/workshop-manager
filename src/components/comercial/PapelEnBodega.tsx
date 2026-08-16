'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Clock, Equal, Warehouse, TriangleAlert } from 'lucide-react';

import { antiguedadLegible, type Suggestion } from '@/lib/paper-substitution';

interface Props {
	substrateType?: string | null;
	grammageGsm?: number | null;
	sheetsNeeded?: number | null;
	widthCm?: number | null;
	heightCm?: number | null;
	productType?: string | null;
	/** Elegirlo no cambia la cotización solo: se lo dice al vendedor y él decide. */
	onUsar?: (s: Suggestion) => void;
}

/** Espera a que el valor deje de moverse antes de dejarlo pasar. */
function useDebounced<T>(valor: T, ms: number): T {
	const [quieto, setQuieto] = useState(valor);
	useEffect(() => {
		const t = setTimeout(() => setQuieto(valor), ms);
		return () => clearTimeout(t);
	}, [valor, ms]);
	return quieto;
}

const FLECHA = {
	arriba: ArrowUp,
	abajo: ArrowDown,
	igual: Equal,
} as const;

/**
 * «Esto ya lo tenemos» — mientras el vendedor cotiza.
 *
 * Aparece al lado del sustrato, en el momento exacto en que decide qué papel
 * lleva el trabajo. Un minuto después ya cotizó y el papel viejo sigue parado.
 *
 * ── Por qué no lo aplica solo ───────────────────────────────────────────────
 *
 * Porque es una decisión comercial, no un cálculo. Cambiar el gramaje cotizado
 * sin que el vendedor lo sepa sería decidir por él frente a su cliente. Lo que
 * hace la pantalla es contestarle una pregunta que hasta ahora costaba caminar
 * hasta bodega — y darle la frase para decirla.
 */
export function PapelEnBodega({
	substrateType,
	grammageGsm,
	sheetsNeeded,
	widthCm,
	heightCm,
	productType,
	onUsar,
}: Props) {
	// Tipear «120» disparaba tres consultas: una por «1», otra por «12» y otra
	// por «120». El vendedor está al teléfono y cada tecla era un viaje al
	// servidor; medio segundo de espera lo convierte en uno solo.
	const gramaje = useDebounced(grammageGsm, 500);
	const pliegos = useDebounced(sheetsNeeded, 500);

	const { data } = useQuery({
		queryKey: ['papel-similar', substrateType, gramaje, pliegos, productType],
		enabled: !!substrateType && !!gramaje,
		queryFn: async () => {
			const q = new URLSearchParams({
				substrate: String(substrateType),
				grammage: String(gramaje),
				sheets: String(pliegos ?? 1),
			});
			if (widthCm) q.set('width', String(widthCm));
			if (heightCm) q.set('height', String(heightCm));
			if (productType) q.set('productType', productType);
			const res = await fetch(`/api/inventory/similar?${q}`);
			if (!res.ok) return { sugeridos: [] as Suggestion[] };
			return res.json() as Promise<{ sugeridos: Suggestion[] }>;
		},
	});

	const sugeridos = data?.sugeridos ?? [];
	if (sugeridos.length === 0) return null;

	return (
		<div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
			<p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
				<Warehouse className="h-3.5 w-3.5" />
				Esto ya lo tenemos en bodega
			</p>

			<ul className="mt-1.5 space-y-1.5">
				{sugeridos.map((s) => {
					const Flecha = FLECHA[s.direction];
					return (
						<li key={s.stock.lotId} className="rounded-md border border-border bg-card px-2.5 py-2">
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
								<Flecha
									className={`h-3.5 w-3.5 shrink-0 ${
										s.direction === 'abajo'
											? 'text-amber-600'
											: s.direction === 'arriba'
												? 'text-emerald-600'
												: 'text-muted-foreground'
									}`}
								/>
								<span className="text-sm font-medium text-foreground">{s.stock.itemName}</span>
								<span className="font-mono text-[11px] text-muted-foreground">{s.stock.lotNumber}</span>
								<span className="text-xs tabular-nums text-muted-foreground">
									{s.stock.quantityAvailable.toLocaleString('es-CL')} pliegos
								</span>

								{/* La antigüedad es el argumento: papel parado es plata parada. */}
								{s.ageDays >= 60 && (
									<span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
										<Clock className="h-2.5 w-2.5" />
										{antiguedadLegible(s.ageDays)}
									</span>
								)}

								{/* Bajar gramaje en un producto que se sostiene solo no es una
								    decisión de teléfono. Se ofrece igual, pero se dice. */}
								{s.needsTechnicalOk && (
									<span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-600 dark:text-red-400">
										<TriangleAlert className="h-2.5 w-2.5" />
										confirmar con producción
									</span>
								)}

								{onUsar && (
									<button
										type="button"
										onClick={() => onUsar(s)}
										className="ml-auto rounded-md border border-primary/40 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
									>
										Cotizar con este
									</button>
								)}
							</div>

							{/* La frase, lista para decirla. Un vendedor apurado dice
							    «tenemos un papel parecido», que suena a descarte. */}
							<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.pitch}</p>

							{!s.fitsFully && (
								<p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
									Cubre el {Math.round(s.coverage * 100)}%: el resto se compra.
								</p>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
