'use client';

import { useQuery } from '@tanstack/react-query';
import {
	Check,
	Copy,
	Loader2,
	Package,
	Plus,
	ShoppingCart,
	Trash2,
	Truck,
	Warehouse,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
	KIND_LABELS,
	SOURCE_LABELS,
	stageState,
	stageSummary,
	whyNotResolved,
	type ReqKind,
	type ReqSource,
	type Requirement,
} from '@/lib/requirements';
import { certStatus } from '@/lib/purchasing';

interface Props {
	ot: { id: string; ot_number: string; client_name?: string | null } | null;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	/**
	 * `allResolved` dice si, después de este guardado, ya no queda ningún
	 * requisito pendiente — es la señal para que quien llama mueva la OT a la
	 * siguiente etapa. Antes este diálogo guardaba la lista y listo: "Todo
	 * conseguido" quedaba escrito en pantalla pero la OT se quedaba en Compras
	 * para siempre, porque nada de acá llamaba a `/transition` (auditoría
	 * 2026-09, OT 41240 atascada pese al 1 de 1).
	 */
	onDone?: (allResolved: boolean) => void;
}

interface Lote {
	id: string;
	lot_number: string;
	quantity_available: number;
	/** Lo que se puede tomar: el saldo con lo reservado descontado. */
	libre: number;
	reservado: number;
	certification_expires_on: string | null;
	inventory_items?: { name?: string | null } | null;
}

const ICONO: Record<ReqSource, typeof ShoppingCart> = {
	comprar: ShoppingCart,
	bodega: Warehouse,
	tercerizar: Truck,
};

/**
 * Compras — todo lo que la OT necesita para producirse.
 *
 * Antes esta etapa se llamaba «Compra de Papel» y el diálogo hacía exactamente
 * eso: una OC, un papel, una recepción. Pero una orden que aterriza en el
 * taller necesita varias cosas y por caminos que no se parecen — un pantone
 * especial que se pide aparte, cajas para despachar, polilaminado que hace un
 * tercero, y muy seguido papel QUE YA ESTÁ EN BODEGA de un trabajo anterior.
 *
 * Ese último es el que rompía el modelo: no hay nada que comprar. Forzarlo a
 * pasar por una OC hace que alguien registre una compra falsa para poder
 * avanzar, o —más probable— que no registre nada.
 *
 * ── Por qué la lista viene propuesta ────────────────────────────────────────
 *
 * La ficha ya sabe que el trabajo lleva dos pantones y laminado. Pedirle a
 * alguien que lo transcriba es pedirle que lo pierda. Se propone y se corrige;
 * no se parte de una hoja en blanco.
 */
export function ComprasDialog({ ot, open, onOpenChange, onDone }: Props) {
	const [reqs, setReqs] = useState<Requirement[]>([]);
	const [esPropuesta, setEsPropuesta] = useState(false);
	/** Lo que se vio al abrir. Vuelve al guardar para detectar la pisada. */
	const [vistoEn, setVistoEn] = useState<string | null>(null);
	const [guardando, setGuardando] = useState(false);
	/**
	 * Un requisito de papel más, si la OT pide hoy más de lo que ya está
	 * cargado — típico tras un retroceso que sube la cantidad, o una merma
	 * que obliga a reponer. Se ofrece, no se agrega sola: sigue siendo
	 * Compras quien decide de dónde sale y a qué precio.
	 */
	const [sugerenciaDescartada, setSugerenciaDescartada] = useState(false);

	const { data, isLoading } = useQuery({
		queryKey: ['requisitos', ot?.id],
		enabled: !!ot?.id && open,
		queryFn: async () => {
			const res = await fetch(`/api/ots/${ot!.id}/requirements`);
			if (!res.ok) throw new Error('No se pudo cargar');
			return res.json() as Promise<{
				requisitos: Requirement[];
				propuesta: boolean;
				visto_en?: string | null;
				sugerencia?: Requirement | null;
			}>;
		},
	});

	useEffect(() => {
		if (data) {
			setReqs(data.requisitos);
			setEsPropuesta(data.propuesta);
			setVistoEn(data.visto_en ?? null);
			setSugerenciaDescartada(false);
		}
	}, [data]);

	const agregarSugerencia = () => {
		if (!data?.sugerencia) return;
		setReqs((rs) => [...rs, data.sugerencia as Requirement]);
		setSugerenciaDescartada(true);
	};

	// Los lotes con saldo, para el camino de bodega. Se piden una vez y sirven
	// para todas las filas.
	const { data: lotes = [] } = useQuery({
		queryKey: ['lotes-con-saldo'],
		enabled: open,
		queryFn: async () => {
			const res = await fetch('/api/inventory/lots?con_saldo=1&limit=200');
			if (!res.ok) return [] as Lote[];
			return ((await res.json()).data ?? []) as Lote[];
		},
	});

	const estado = stageState(reqs);

	const cambiar = (i: number, patch: Partial<Requirement>) =>
		setReqs((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

	// La base exige un solo camino por fila (ot_requirements_un_solo_camino):
	// un requisito sale de una compra O de bodega, no de las dos. Repartir
	// "1000 pliegos: 400 ya en bodega + 600 por comprar" entre dos fuentes se
	// hace entonces con dos filas, no con una fila que sepa repartirse sola.
	// Duplicar copia la cantidad para que sólo haya que recortarla en cada una,
	// y limpia OC/lote/estado porque esas cosas son de cada fila, no del par.
	const duplicar = (i: number) =>
		setReqs((rs) => {
			const copia: Requirement = {
				...rs[i],
				id: undefined,
				purchaseId: null,
				lotId: null,
				status: 'pendiente',
			};
			return [...rs.slice(0, i + 1), copia, ...rs.slice(i + 1)];
		});

	const guardar = async () => {
		if (!ot) return;
		setGuardando(true);
		const res = await fetch(`/api/ots/${ot.id}/requirements`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				visto_en: vistoEn,
				requisitos: reqs.map((r) => ({
					kind: r.kind,
					description: r.description,
					item_id: r.itemId ?? null,
					quantity: r.quantity ?? null,
					unit: r.unit ?? null,
					source: r.source,
					purchase_id: r.purchaseId ?? null,
					lot_id: r.lotId ?? null,
					status: r.status,
					notes: r.notes ?? null,
				})),
			}),
		});
		setGuardando(false);
		const b = await res.json().catch(() => null);
		if (!res.ok) {
			// Que alguien más haya guardado no es culpa de quien está guardando:
			// se le dice qué pasó y qué hacer, no «error».
			if (b?.code === 'EDICION_SIMULTANEA') {
				toast.warning(b.error, { duration: 8000 });
				return;
			}
			toast.error(b?.error ?? 'No se pudo guardar');
			return;
		}
		// ── Comprometer el papel elegido ──────────────────────────────────────
		//
		// Guardar «sale del lote X» sin reservarlo deja el pallet disponible para
		// que otra OT se lo lleve. La reserva se hace DESPUÉS de guardar, porque
		// si el guardado falla no hay que comprometer nada.
		//
		// Es mejor esfuerzo a propósito: el requisito ya quedó registrado, y si
		// una reserva no entra —porque alguien tomó el papel primero— eso se
		// avisa sin deshacer lo que sí se guardó.
		const deBodega = reqs.filter((r) => r.source === 'bodega' && r.lotId);
		const noReservados: string[] = [];
		for (const r of deBodega) {
			const res = await fetch('/api/lots/reserve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lot_id: r.lotId,
					ot_id: ot.id,
					quantity: r.quantity && r.quantity > 0 ? r.quantity : 1,
				}),
			});
			if (!res.ok) {
				const eb = await res.json().catch(() => null);
				noReservados.push(eb?.error ?? r.description);
			}
		}

		toast.success(b.resumen);
		if (noReservados.length > 0) {
			toast.warning(`No se pudo comprometer el papel: ${noReservados.join(' · ')}`, {
				duration: 9000,
			});
		} else if (deBodega.length > 0) {
			toast.success(
				`${deBodega.length === 1 ? 'Un lote queda comprometido' : `${deBodega.length} lotes quedan comprometidos`} con esta OT.`,
			);
		}

		setEsPropuesta(false);
		// El estado que cuenta es el que confirmó el servidor con este guardado,
		// no el que ya tenía la pantalla antes de guardar.
		onDone?.(!!b.estado?.completo);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl gap-3 p-5">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Package className="h-5 w-5 text-primary" />
						Compras · {ot?.ot_number}
					</DialogTitle>
					<DialogDescription>
						{ot?.client_name ? `${ot.client_name} · ` : ''}
						{stageSummary(estado)}
					</DialogDescription>
				</DialogHeader>

				{/* Que la lista es una propuesta y no un registro tiene que decirse:
				    si no, alguien la cierra creyendo que ya estaba guardada. */}
				{esPropuesta && reqs.length > 0 && (
					<p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
						Esto es una propuesta armada con lo que dice la ficha. Revisala, corregila y
						guardala — todavía no está registrada.
					</p>
				)}

				{/* La OT pide hoy más papel del que este requisito ya cubre — sólo se
				    ofrece, no se agrega sola: sigue siendo Compras quien elige de dónde
				    sale y a qué precio. */}
				{data?.sugerencia && !sugerenciaDescartada && (
					<div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
						<span>
							La OT necesita <strong>{data.sugerencia.quantity?.toLocaleString('es-CL')} pliegos</strong> más
							de los que este requisito ya cubre — probablemente un retroceso o una merma la hizo crecer.
						</span>
						<div className="flex shrink-0 gap-1.5">
							<Button size="sm" variant="outline" className="h-7 text-xs" onClick={agregarSugerencia}>
								Agregar requisito
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="h-7 text-xs text-muted-foreground"
								onClick={() => setSugerenciaDescartada(true)}
							>
								Descartar
							</Button>
						</div>
					</div>
				)}

				{isLoading ? (
					<p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
				) : (
					<div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
						{reqs.map((r, i) => {
							const Icono = ICONO[r.source];
							const falta = whyNotResolved(r);
							return (
								<div
									key={i}
									className={`rounded-lg border px-3 py-2 ${
										r.status === 'resuelto'
											? 'border-emerald-500/40 bg-emerald-500/5'
											: r.status === 'no_aplica'
												? 'border-border bg-muted/30 opacity-60'
												: 'border-border bg-card'
									}`}
								>
									<div className="flex flex-wrap items-center gap-2">
										<Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
										<Input
											value={r.description}
											onChange={(e) => cambiar(i, { description: e.target.value })}
											className="h-8 min-w-0 flex-1 text-sm"
										/>
										<Input
											type="number"
											min="0"
											step="any"
											value={r.quantity ?? ''}
											onChange={(e) =>
												cambiar(i, {
													quantity: e.target.value === '' ? null : Number(e.target.value),
												})
											}
											placeholder="Cant."
											// w-24, no w-16: un pliego de cartulina de esta OT es 32.620 — un campo
											// angosto lo mostraba cortado a "326" (auditoría 2026-08).
											className="h-8 w-24 shrink-0 text-sm"
										/>
										<Input
											value={r.unit ?? ''}
											onChange={(e) => cambiar(i, { unit: e.target.value || null })}
											placeholder="unidad"
											className="h-8 w-20 shrink-0 text-sm"
										/>
										<select
											value={r.kind}
											onChange={(e) => cambiar(i, { kind: e.target.value as ReqKind })}
											className="h-8 rounded-md border border-input bg-background px-2 text-xs"
										>
											{(Object.keys(KIND_LABELS) as ReqKind[]).map((k) => (
												<option key={k} value={k}>
													{KIND_LABELS[k]}
												</option>
											))}
										</select>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 w-8 p-0 text-muted-foreground"
											onClick={() => duplicar(i)}
											aria-label="Duplicar fila"
											title="Duplicar — para repartir la cantidad entre dos fuentes"
										>
											<Copy className="h-3.5 w-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 w-8 p-0 text-muted-foreground"
											onClick={() => setReqs((rs) => rs.filter((_, j) => j !== i))}
											aria-label="Quitar"
										>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									</div>

									<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
										{/* Los tres caminos, siempre visibles. Que «sacar de bodega»
										    esté al lado de «comprar» es todo el punto de esta pantalla. */}
										{(Object.keys(SOURCE_LABELS) as ReqSource[]).map((s) => (
											<button
												key={s}
												type="button"
												onClick={() => cambiar(i, { source: s, purchaseId: null, lotId: null })}
												className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
													r.source === s
														? 'border-primary bg-primary/10 font-medium text-primary'
														: 'border-border text-muted-foreground hover:border-primary/40'
												}`}
											>
												{SOURCE_LABELS[s]}
											</button>
										))}

										{/* De bodega: se elige el lote, y ahí se forma la trazabilidad
										    hacia atrás sin pasar por ninguna compra. */}
										{r.source === 'bodega' && (
											<select
												value={r.lotId ?? ''}
												onChange={(e) => cambiar(i, { lotId: e.target.value || null })}
												className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
											>
												<option value="">¿De qué lote sale?</option>
												{lotes.map((l) => {
													const cert = certStatus(l.certification_expires_on);
													// Lo LIBRE, no lo físico: ofrecer papel comprometido con
													// otra orden es prometer algo que no está.
													const libre = Number(l.libre ?? l.quantity_available);
													const comprometido = Number(l.reservado ?? 0);
													return (
														<option key={l.id} value={l.id}>
															{l.lot_number} · {l.inventory_items?.name ?? ''} ·{' '}
															{libre.toLocaleString('es-CL')} libres
															{comprometido > 0
																? ` (${comprometido.toLocaleString('es-CL')} comprometidos)`
																: ''}
															{cert === 'vencido' ? ' ⚠ cert vencido' : ''}
														</option>
													);
												})}
											</select>
										)}

										<button
											type="button"
											onClick={() =>
												cambiar(i, { status: r.status === 'resuelto' ? 'pendiente' : 'resuelto' })
											}
											disabled={!!falta && r.status !== 'resuelto'}
											title={falta ?? undefined}
											className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
												r.status === 'resuelto'
													? 'bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-400'
													: 'border border-border text-muted-foreground hover:border-emerald-500/50'
											}`}
										>
											<Check className="h-3 w-3" />
											{r.status === 'resuelto' ? 'Resuelto' : 'Marcar resuelto'}
										</button>
									</div>

									{/* El motivo por el que todavía no se puede cerrar, en el lugar
									    donde está el botón que no se puede apretar. */}
									{falta && r.status !== 'resuelto' && (
										<p className="mt-1 text-[11px] text-muted-foreground">{falta}</p>
									)}
								</div>
							);
						})}

						<Button
							variant="outline"
							size="sm"
							className="w-full text-xs"
							onClick={() =>
								setReqs((rs) => [
									...rs,
									{ kind: 'otro', description: '', source: 'comprar', status: 'pendiente' },
								])
							}
						>
							<Plus className="mr-1 h-3 w-3" />
							Agregar algo más
						</Button>
					</div>
				)}

				<div className="flex items-center justify-between gap-2 border-t border-border pt-3">
					<p className="text-xs text-muted-foreground">
						{estado.resueltos} de {estado.total} conseguidos
					</p>
					<div className="flex gap-2">
						<Button variant="ghost" onClick={() => onOpenChange(false)}>
							Cerrar
						</Button>
						<Button onClick={guardar} disabled={guardando || reqs.length === 0}>
							{guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
							Guardar
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
