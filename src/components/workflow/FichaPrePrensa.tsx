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

/** Dónde se completa cada cosa. Sin esto la lista dice qué falta y no dónde ir. */
const DONDE: Partial<Record<keyof OTSpec, { texto: string; href: (otId: string) => string }>> = {
	// `/operaciones/ot/[id]` NO EXISTE — nunca existió. Todos estos enlaces eran
	// 404, y el peor caía justo en el paso donde la orden se destraba. Lo que sí
	// existe es el asistente, que es donde se completan los datos de una OT.
	substrateBrand: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	substrateSupplier: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	impositionConfirmed: { texto: 'Programar en máquina', href: () => '/planta' },
	machineId: { texto: 'Programar en máquina', href: () => '/planta' },
	operationsReviewed: { texto: 'Revisar operaciones', href: () => '/planta' },
	// `artAttached` no está: se resuelve acá mismo, subiendo el archivo.
	pressId: { texto: 'Elegir prensa', href: () => '/operaciones/kanban?asistente=1' },
	// `dieSource` no está acá a propósito: se resuelve dentro de la ficha con el
	// estante a la vista, no mandando a nadie a otra pantalla.
	dieCode: { texto: 'Elegir del estante', href: () => '/operaciones/kanban?asistente=1' },
	laminationType: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	clicheCode: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
	relieveMatrixCode: { texto: 'Completar en el asistente', href: () => '/operaciones/kanban?asistente=1' },
};

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
				    apruebe. Si no hay dónde anotarla, desaparece en gastos generales. */}
				<div className="flex items-center gap-2 border-t border-border pt-3">
					<Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setMaquetas(true)}>
						<Box className="mr-1.5 h-3.5 w-3.5" /> Registrar maquetas
					</Button>
					<span className="text-xs text-muted-foreground">
						Lo que cuesta convencer al cliente antes de imprimir nada.
					</span>
				</div>

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
