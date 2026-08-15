'use client';

/**
 * Pre-Prensa: la compuerta antes del punto de no retorno.
 *
 * Una OT llega acá con la mitad de la ficha — el vendedor juntó lo que se junta
 * al teléfono. Lo que falta es lo que sólo se sabe acá: qué papel exactamente,
 * cómo se monta, con qué arte.
 *
 * Ordena por ANTIGÜEDAD: primero lo que lleva más tiempo esperando. Ordenar por
 * «lo que menos le falta» ponía arriba lo fácil de cerrar, que es al revés de
 * cómo se gobierna una cola — lo que hunde una fecha de entrega es el trabajo
 * que lleva seis días parado, no el que entró hoy con un hueco.
 *
 * Y separa los pendientes por DUEÑO: lo interno se resuelve caminando diez
 * metros, lo del cliente con un llamado.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileStack } from 'lucide-react';

import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { FichaPrePrensa } from '@/components/workflow/FichaPrePrensa';
import type { OTSpec } from '@/lib/ot-spec';

interface Trabajo {
	ot_id: string;
	ot_number: string;
	client_name: string | null;
	deadline: string | null;
	spec: OTSpec;
	faltan: number;
	en_pre_prensa_desde: string | null;
	espera_al_cliente: boolean;
	quoted_price: number | null;
	firm_price: number | null;
}

/** Días enteros esperando. La misma cuenta que hace la ficha. */
function diasEsperando(desde?: string | null): number | null {
	if (!desde) return null;
	const t = new Date(desde).getTime();
	if (!Number.isFinite(t)) return null;
	return Math.floor((Date.now() - t) / 86_400_000);
}

function PrePrensaInner() {
	const [seleccionada, setSeleccionada] = useState<string | null>(null);
	const { data, isLoading, refetch } = useQuery<{ trabajos: Trabajo[]; diagnostics: { total: number; listas: number; esperando_al_cliente: number } }>({
		queryKey: ['ots', 'pre-press'],
		queryFn: async () => {
			const res = await fetch('/api/ots/pre-press', { credentials: 'include' });
			if (!res.ok) throw new Error('No se pudo cargar Pre-Prensa');
			return res.json();
		},
	});

	if (isLoading) {
		return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>;
	}

	const trabajos = data?.trabajos ?? [];
	// La primera de la cola es la más vieja, que es la que hay que atender.
	// `?? trabajos[0]` y no un `useEffect`: si la elegida desaparece —porque se
	// completó y salió de Pre-Prensa— la pantalla cae sola en la siguiente en vez
	// de quedarse en blanco.
	const actual = trabajos.find((t) => t.ot_id === seleccionada) ?? trabajos[0];
	const { total = 0, listas = 0, esperando_al_cliente = 0 } = data?.diagnostics ?? {};

	if (trabajos.length === 0) {
		return (
			<Card>
				<CardContent className="py-10 text-center">
					<p className="text-sm font-medium text-foreground">No hay órdenes en Pre-Prensa.</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Las cotizaciones firmadas entran acá cuando se convierten en OT.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			<dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
				<div>
					<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">En Pre-Prensa</dt>
					<dd className="text-lg font-semibold tabular-nums text-foreground">{total}</dd>
				</div>
				<div>
					<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Listas para la prueba</dt>
					<dd className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-foreground">
						{listas > 0 && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
						{listas}
					</dd>
				</div>
				<div>
					<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Todavía incompletas</dt>
					<dd className="text-lg font-semibold tabular-nums text-foreground">{total - listas}</dd>
				</div>
				{/* Las que el taller ya no puede destrabar solo: son llamados, no
				    trabajo de Pre-Prensa. Confundirlas hace que nadie llame. */}
				<div>
					<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Esperando al cliente</dt>
					<dd className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">{esperando_al_cliente}</dd>
				</div>
			</dl>

			{/* Cola a la izquierda, la elegida a la derecha.

			    Apilar la ficha entera de cada OT funcionaba con dos y es un muro con
			    veinte: para encontrar una hay que recorrer todas. Quien trabaja en
			    Pre-Prensa toma UNA y la cierra, así que la pantalla se arma igual —
			    se elige de la cola y se trabaja al lado. */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
				<ul className="space-y-1.5" role="listbox" aria-label="Órdenes en Pre-Prensa">
					{trabajos.map((t) => {
						const dias = diasEsperando(t.en_pre_prensa_desde);
						// Contra la que se está MOSTRANDO, no contra el estado: al abrir,
						// `seleccionada` es null y la ficha ya cayó en la primera. Comparar
						// con el estado dejaba la lista sin marcar nada mientras el detalle
						// mostraba algo — dos partes de la pantalla diciendo cosas distintas.
						const elegida = t.ot_id === actual?.ot_id;
						return (
							<li key={t.ot_id}>
								<button
									type="button"
									role="option"
									aria-selected={elegida}
									onClick={() => setSeleccionada(t.ot_id)}
									className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
										elegida
											? 'border-primary bg-primary/5'
											: 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
									}`}
								>
									<div className="flex flex-wrap items-baseline gap-x-2">
										<span className="font-mono text-sm font-semibold text-foreground">{t.ot_number}</span>
										{dias !== null && dias > 0 && (
											<span
												className={`ml-auto text-[11px] tabular-nums ${
													dias >= 3 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground'
												}`}
											>
												{dias}d
											</span>
										)}
									</div>
									<p className="truncate text-xs text-muted-foreground">{t.client_name}</p>
									<p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
										{t.faltan === 0 ? (
											<span className="font-medium text-emerald-700 dark:text-emerald-400">Lista para la prueba</span>
										) : (
											<>
												<span className="text-muted-foreground">
													falta{t.faltan === 1 ? '' : 'n'} {t.faltan}
												</span>
												{t.espera_al_cliente && (
													<span className="rounded-full bg-amber-500/15 px-1.5 text-amber-700 dark:text-amber-400">
														espera al cliente
													</span>
												)}
											</>
										)}
									</p>
								</button>
							</li>
						);
					})}
				</ul>

				<div>
					{actual ? (
						<div className="space-y-1">
							<div className="flex flex-wrap items-baseline gap-x-2 px-1">
								<span className="font-mono font-semibold text-foreground">{actual.ot_number}</span>
								<span className="text-sm text-muted-foreground">{actual.client_name}</span>
								{actual.deadline && (
									<span className="ml-auto text-xs text-muted-foreground">
										entrega {new Date(actual.deadline.length <= 10 ? `${actual.deadline}T00:00:00` : actual.deadline)
											.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
									</span>
								)}
							</div>
							<FichaPrePrensa
								otId={actual.ot_id}
								otNumber={actual.ot_number}
								spec={actual.spec}
								quotedPrice={actual.quoted_price}
								firmPrice={actual.firm_price}
								desde={actual.en_pre_prensa_desde}
								onChanged={() => refetch()}
							/>
						</div>
					) : (
						<Card>
							<CardContent className="py-10 text-center text-sm text-muted-foreground">
								Elegí una orden de la lista.
							</CardContent>
						</Card>
					)}
				</div>
			</div>
		</div>
	);
}

export default function PrePrensaPage() {
	return (
		<ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager']}>
			<div className="space-y-6 p-4 md:p-6">
				<div className="flex items-center gap-3">
					<span className="rounded-xl bg-amber-500/10 p-3">
						<FileStack className="h-6 w-6 text-amber-500" />
					</span>
					<div>
						<h1 className="text-2xl font-bold text-foreground">Pre-Prensa</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Completar la ficha antes de mandar la prueba. Firmarla compromete el trabajo:
							después se compra papel y se graban planchas.
						</p>
					</div>
				</div>
				<PrePrensaInner />
			</div>
		</ProtectedRoute>
	);
}
