'use client';

/**
 * Qué le falta a esta OT para poder mandar la prueba.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Una OT convertida desde una cotización nace con la mitad de la ficha: el
 * vendedor juntó lo que se junta al teléfono, y falta lo que sólo se sabe en
 * Pre-Prensa —la marca del papel, el montaje real, el diseño, las operaciones
 * revisadas.
 *
 * Esa brecha existía igual antes de esta pantalla. La diferencia es que era
 * invisible: la orden se veía completa, se compraba papel, y el faltante
 * aparecía como un costo que nadie había previsto.
 *
 * ── Lo que NO es ────────────────────────────────────────────────────────────
 *
 * No es un formulario nuevo. Es una lista de lo que falta, con el motivo y el
 * enlace a donde se completa. Un segundo formulario para los mismos campos sería
 * otra puerta para el mismo trabajo, que es el error que este repositorio lleva
 * meses cerrando.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Box, CheckCircle2, Clock, Loader2, Send } from 'lucide-react';
import Link from 'next/link';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DisenoDeLaOT } from '@/components/workflow/DisenoDeLaOT';
import { TroquelDelEstante } from '@/components/workflow/TroquelDelEstante';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MaquetasDialog } from './MaquetasDialog';
import { formatCLP } from '@/lib/format';
import { missingFor, priceBand, quoteDrift, type Gap, type OTSpec } from '@/lib/ot-spec';

interface Props {
	otId: string;
	otNumber: string;
	spec: OTSpec;
	/** Lo que el cliente aceptó. */
	quotedPrice?: number | null;
	/** Lo que da el motor ahora, con lo que Pre-Prensa completó. */
	firmPrice?: number | null;
	/** Cuándo entró a Pre-Prensa, para poder decir hace cuánto espera. */
	desde?: string | null;
	onChanged?: () => void;
}

/** Días enteros esperando. Sale de la fecha, no de un contador guardado. */
function diasEsperando(desde?: string | null): number | null {
	if (!desde) return null;
	const t = new Date(desde).getTime();
	if (!Number.isFinite(t)) return null;
	return Math.floor((Date.now() - t) / 86_400_000);
}

/**
 * Días que quedan hasta la entrega comprometida. Negativo = ya vencida.
 *
 * La Fase A de la especificación pedía esto explícitamente —"si sale hoy,
 * entrega el 27; cada día que espera la corre uno"— y nunca se construyó: la
 * pantalla mostraba la antigüedad (hace cuánto espera) pero nunca la
 * consecuencia (qué le hace eso a la fecha prometida). Son dos preguntas
 * distintas y la segunda es la que de verdad le importa al vendedor.
 */
function diasParaEntrega(deadline?: string | null): number | null {
	if (!deadline) return null;
	const t = new Date(deadline.length <= 10 ? `${deadline}T23:59:59` : deadline).getTime();
	if (!Number.isFinite(t)) return null;
	return Math.ceil((t - Date.now()) / 86_400_000);
}

/** Dónde se completa cada cosa. Sin esto la lista dice qué falta y no dónde ir. */
const DONDE: Partial<Record<keyof OTSpec, { texto: string; href: (otId: string) => string }>> = {
	// `/operaciones/ot/[id]` NO EXISTE — nunca existió. Todos estos enlaces eran
	// 404, y el peor caía justo en el paso donde la orden se destraba. Lo que sí
	// existe es el asistente, que es donde se completan los datos de una OT.
	substrateBrand: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	substrateSupplier: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	// Apuntaban a /planta -- el asignador de operarios a estaciones, que nunca
	// escribe `ot_machine_schedule` ni `ot_operations`. El enlace no daba 404
	// (por eso no se veía) pero tampoco resolvía nada: mandaba a alguien a
	// caminar hasta un lugar que no podía cerrar el hueco que lo mandó ahí
	// (auditoría 2026-08-31).
	//
	// El montaje de verdad (una fila en `ot_machine_schedule`) se programa en
	// Hoja de Producción -- y programar ahí ahora también fija
	// `assigned_machine_id` si estaba vacío, así que la misma acción cierra
	// montaje Y máquina asignada.
	impositionConfirmed: { texto: 'Programar en Hoja de Producción', href: () => '/operaciones/hoja-produccion' },
	machineId: { texto: 'Programar en Hoja de Producción', href: () => '/operaciones/hoja-produccion' },
	// Las operaciones se revisan en el Kanban: el botón "Montaje/Costos" de la
	// tarjeta abre EditBudgetWizard para esta OT -- estaba montado en el
	// tablero pero nada lo abría hasta ahora.
	operationsReviewed: { texto: 'Revisar operaciones', href: (otId) => `/operaciones/kanban?editar=${otId}` },
	// `artAttached` no está: se resuelve acá mismo, subiendo el archivo.
	pressId: { texto: 'Elegir prensa', href: () => '/operaciones/kanban?asistente=1' },
	// `dieSource` no está acá a propósito: se resuelve dentro de la ficha con el
	// estante a la vista, no mandando a nadie a otra pantalla.
	dieCode: { texto: 'Elegir del estante', href: () => '/operaciones/kanban?asistente=1' },
	laminationType: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	clicheCode: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	relieveMatrixCode: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	// No hay pantalla para esto -- es un llamado. El enlace lleva a donde se
	// escribe la fecha una vez que el cliente la dio.
	deadline: { texto: 'Cargar fecha', href: (otId) => `/operaciones/kanban?editar=${otId}` },
};

/**
 * Vueltas y costo acumulado, visibles antes de abrir el diálogo.
 *
 * Misma `queryKey` que `MaquetasDialog` (['maquetas', otId]) a propósito:
 * React Query cachea la respuesta una sola vez y las dos vistas la comparten
 * -- abrir el diálogo después no repite el fetch.
 */
function MaquetasResumen({ otId, onAbrir }: { otId: string; onAbrir: () => void }) {
	const { data } = useQuery<{ rounds: number; total: number }>({
		queryKey: ['maquetas', otId],
		queryFn: async () => {
			const r = await fetch(`/api/ots/${otId}/maquetas`, { credentials: 'include' });
			if (!r.ok) throw new Error('No se pudo leer');
			return r.json();
		},
	});
	const vueltas = data?.rounds ?? 0;
	const total = data?.total ?? 0;

	return (
		<div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
			<Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAbrir}>
				<Box className="mr-1.5 h-3.5 w-3.5" /> Registrar maquetas
			</Button>
			{vueltas > 0 ? (
				<span className="text-xs font-medium text-foreground">
					{vueltas} {vueltas === 1 ? 'vuelta registrada' : 'vueltas registradas'} ·{' '}
					<span className="tabular-nums text-amber-700 dark:text-amber-400">{formatCLP(total)}</span> acumulado
					{vueltas >= 3 && (
						<span className="ml-1.5 text-muted-foreground">— cliente que cuesta convencer</span>
					)}
				</span>
			) : (
				<span className="text-xs text-muted-foreground">
					Lo que cuesta convencer al cliente antes de imprimir nada.
				</span>
			)}
		</div>
	);
}

export function FichaPrePrensa({ otId, otNumber, spec, quotedPrice, firmPrice, desde, onChanged }: Props) {
	const [maquetas, setMaquetas] = useState(false);
	const faltan = missingFor(2, spec);
	const banda = priceBand(spec, firmPrice ?? quotedPrice ?? 0);
	const deriva = quoteDrift({
		quoted: quotedPrice,
		firm: firmPrice,
		band: quotedPrice ? priceBand(spec, quotedPrice) : null,
	});

	const lista = faltan.length === 0;

	// Dos listas de trabajo distintas: lo interno se resuelve caminando diez
	// metros, lo del cliente con un llamado. Juntos se ven igual de urgentes y no
	// se hace ninguno.
	const nuestros = faltan.filter((g) => g.owner === 'interno');
	const delCliente = faltan.filter((g) => g.owner === 'cliente');
	const dias = diasEsperando(desde);
	const diasEntrega = diasParaEntrega(spec.deadline);
	const [mandando, setMandando] = useState(false);

	/**
	 * Pre-Prensa → Visto Bueno.
	 *
	 * El servidor revalida la ficha con la misma regla que se muestra acá: si
	 * entre que se pintó la pantalla y el clic alguien dejó un hueco, la
	 * transición se rechaza nombrando qué falta.
	 */
	const mandarLaPrueba = async () => {
		setMandando(true);
		const res = await fetch(`/api/ots/${otId}/transition`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ to_status: 'visto_bueno', reason: 'pre_prensa_prueba_lista' }),
		});
		setMandando(false);
		if (!res.ok) {
			const b = await res.json().catch(() => null);
			toast.error(b?.error ?? b?.message ?? 'No se pudo mandar la prueba');
			return;
		}
		toast.success(`${otNumber} pasó a Visto Bueno. Ahora se registra la respuesta del cliente.`);
		onChanged?.();
	};

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-sm">
					{lista ? (
						<CheckCircle2 className="h-4 w-4 text-emerald-600" />
					) : (
						<AlertTriangle className="h-4 w-4 text-amber-500" />
					)}
					{lista
						? 'Lista para la prueba'
						: faltan.length === 1
							? 'Falta un dato para mandar la prueba'
							: `Faltan ${faltan.length} datos para mandar la prueba`}
					{/* La antigüedad es lo que hunde una fecha de entrega, y no se
					    veía. Tres días es donde deja de ser normal. */}
					{dias !== null && dias > 0 && (
						<span
							className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
								dias >= 3
									? 'bg-red-500/15 text-red-600 dark:text-red-400'
									: 'bg-muted text-muted-foreground'
							}`}
						>
							<Clock className="h-3 w-3" />
							{dias === 1 ? 'hace 1 día' : `hace ${dias} días`}
						</span>
					)}
				</CardTitle>
				<p className="text-xs leading-relaxed text-muted-foreground">
					Firmar la prueba es el punto de no retorno: después se compra papel y se graban
					planchas. Por eso la ficha tiene que estar entera <strong>antes</strong>, no después.
				</p>
				{/* El impacto en la fecha, no sólo la antigüedad. La cola ya decía
				    "hace 6 días acá"; lo que le faltaba es la consecuencia -- qué le
				    hace eso a la fecha que se le prometió al cliente. Sin fecha
				    cargada, ni siquiera se puede contestar la pregunta, y eso es un
				    hueco de nivel 1 tan real como cualquier otro (spec Fase A). */}
				{!lista && (
					!spec.deadline ? (
						<p className="mt-2 flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:text-red-400">
							<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
							Sin fecha de entrega comprometida — no se puede saber qué tan urgente es esto.
						</p>
					) : diasEntrega !== null && (
						<p
							className={`mt-2 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
								diasEntrega < 0
									? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
									: diasEntrega <= 2
										? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
										: 'border-border bg-muted/40 text-muted-foreground'
							}`}
						>
							<Clock className="h-3.5 w-3.5 shrink-0" />
							{diasEntrega < 0
								? `La entrega ya venció hace ${Math.abs(diasEntrega)} ${Math.abs(diasEntrega) === 1 ? 'día' : 'días'}.`
								: diasEntrega === 0
									? 'Entrega comprometida hoy.'
									: `Entrega comprometida en ${diasEntrega} ${diasEntrega === 1 ? 'día' : 'días'}.`}{' '}
							Cada día que esta ficha sigue incompleta le saca uno a esos días.
						</p>
					)
				)}
			</CardHeader>

			<CardContent className="space-y-4">
				{lista ? (
					<div className="space-y-2">
						<p className="text-sm text-emerald-700 dark:text-emerald-400">
							La <span className="font-mono font-semibold">{otNumber}</span> tiene todo lo que
							hace falta para producirla. El precio de la prueba es firme.
						</p>
						{/* La pantalla decía «está lista» y no ofrecía hacer nada al
						    respecto: la única forma de avanzar era ir al Kanban y
						    arrastrar la tarjeta. Un estado que se anuncia y no se puede
						    accionar obliga a saber por dónde sigue el flujo, y eso es
						    justo lo que una pantalla de trabajo tiene que evitar. */}
						<Button size="sm" className="h-8 text-xs" disabled={mandando} onClick={mandarLaPrueba}>
							{mandando ? (
								<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
							) : (
								<Send className="mr-1.5 h-3.5 w-3.5" />
							)}
							Mandar la prueba al cliente
						</Button>
					</div>
				) : (
				<div className="space-y-3">
					{[
						{ clave: 'interno' as const, titulo: 'Lo resolvemos nosotros', huecos: nuestros },
						{ clave: 'cliente' as const, titulo: 'Lo tiene que traer el cliente', huecos: delCliente },
					]
						.filter((grupo) => grupo.huecos.length > 0)
						.map((grupo) => (
							<div key={grupo.clave}>
								<p
									className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${
										grupo.clave === 'cliente' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
									}`}
								>
									{grupo.titulo}
								</p>
								<ul className="space-y-2">
									{grupo.huecos.map((g: Gap) => {
										const donde = DONDE[g.field];
										return (
											<li key={g.field} className="rounded-md border border-border bg-card px-3 py-2">
												<div className="flex flex-wrap items-baseline gap-x-2">
													<span className="text-sm font-medium text-foreground">{g.label}</span>
													{donde && (
														<Link
															href={donde.href(otId)}
															className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
														>
															{donde.texto} <ArrowRight className="h-3 w-3" />
														</Link>
													)}
												</div>
												<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{g.why}</p>
											{/* El troquel no se resuelve en otra pantalla: se resuelve
											    acá, mostrando el estante. Mandar a quien está en
											    Pre-Prensa a buscar en otro lado es lo que hacía que
											    nadie mirara y se comprara de nuevo. */}
											{g.field === 'artAttached' && (
												<DisenoDeLaOT otId={otId} onChanged={onChanged} />
											)}
											{g.field === 'dieSource' && (
												<div className="mt-2 border-t border-border pt-2">
													<TroquelDelEstante
														otId={otId}
														widthCm={spec.widthCm}
														heightCm={spec.heightCm}
														productType={spec.productType}
														clientId={spec.clientId}
														onChanged={onChanged}
													/>
												</div>
											)}
											</li>
										);
									})}
								</ul>
							</div>
						))}
				</div>
				)}

				{/* La maqueta se arma acá, y su costo se paga aunque el cliente no
				    apruebe. Si no hay dónde anotarla, desaparece en gastos generales.
				    El conteo y el acumulado van AL LADO del botón -- la especificación
				    (Fase D) lo pedía así a propósito: el dato ya existía en
				    `ot_cost_lines` y sólo se veía adentro del diálogo, así que nadie lo
				    miraba antes de decidir mandar la vuelta siguiente (auditoría
				    2026-08-31). Misma query key que `MaquetasDialog`: comparten caché,
				    no hay una segunda llamada. */}
				<MaquetasResumen otId={otId} onAbrir={() => setMaquetas(true)} />

				<MaquetasDialog
					otId={otId}
					otNumber={otNumber}
					open={maquetas}
					onOpenChange={setMaquetas}
					onSaved={onChanged}
				/>

				{/* El precio, y cuánto se movió desde lo que el cliente aceptó. */}
				{(quotedPrice ?? 0) > 0 && (
					<div className="border-t border-border pt-3">
						<dl className="flex flex-wrap gap-x-8 gap-y-2">
							<div>
								<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Cotizado</dt>
								<dd className="text-sm font-semibold tabular-nums text-foreground">{formatCLP(quotedPrice!)}</dd>
							</div>
							{(firmPrice ?? 0) > 0 && (
								<div>
									<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
										{banda.firm ? 'Firme' : 'Estimado hoy'}
									</dt>
									<dd className="text-sm font-semibold tabular-nums text-foreground">
										{banda.firm
											? formatCLP(firmPrice!)
											: `${formatCLP(banda.low)} – ${formatCLP(banda.high)}`}
									</dd>
								</div>
							)}
						</dl>

						{deriva.note && (
							<p
								className={`mt-2 text-xs leading-relaxed ${
									deriva.direction === 'sube'
										? 'text-amber-700 dark:text-amber-400'
										: 'text-muted-foreground'
								}`}
							>
								{deriva.note}
							</p>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
