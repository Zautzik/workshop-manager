'use client';

/**
 * Qué le falta a esta OT para poder mandar la prueba.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Una OT convertida desde una cotización nace con la mitad de la ficha: el
 * vendedor juntó lo que se junta al teléfono, y falta lo que sólo se sabe en
 * Pre-Prensa —la marca del papel, el montaje real, el arte, las operaciones
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

import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCLP } from '@/lib/format';
import { missingFor, priceBand, quoteDrift, type OTSpec } from '@/lib/ot-spec';

interface Props {
	otId: string;
	otNumber: string;
	spec: OTSpec;
	/** Lo que el cliente aceptó. */
	quotedPrice?: number | null;
	/** Lo que da el motor ahora, con lo que Pre-Prensa completó. */
	firmPrice?: number | null;
}

/** Dónde se completa cada cosa. Sin esto la lista dice qué falta y no dónde ir. */
const DONDE: Partial<Record<keyof OTSpec, { texto: string; href: (otId: string) => string }>> = {
	substrateBrand: { texto: 'Editar la ficha', href: (id) => `/operaciones/ot/${id}` },
	substrateSupplier: { texto: 'Editar la ficha', href: (id) => `/operaciones/ot/${id}` },
	impositionConfirmed: { texto: 'Programar en máquina', href: () => '/planta' },
	machineId: { texto: 'Programar en máquina', href: () => '/planta' },
	operationsReviewed: { texto: 'Revisar operaciones', href: (id) => `/operaciones/ot/${id}` },
	artAttached: { texto: 'Adjuntar el arte', href: (id) => `/operaciones/ot/${id}` },
	pressId: { texto: 'Elegir prensa', href: (id) => `/operaciones/ot/${id}` },
};

export function FichaPrePrensa({ otId, otNumber, spec, quotedPrice, firmPrice }: Props) {
	const faltan = missingFor(2, spec);
	const banda = priceBand(spec, firmPrice ?? quotedPrice ?? 0);
	const deriva = quoteDrift({
		quoted: quotedPrice,
		firm: firmPrice,
		band: quotedPrice ? priceBand(spec, quotedPrice) : null,
	});

	const lista = faltan.length === 0;

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-sm">
					{lista ? (
						<CheckCircle2 className="h-4 w-4 text-emerald-600" />
					) : (
						<AlertTriangle className="h-4 w-4 text-amber-500" />
					)}
					{lista ? 'Lista para mandar la prueba' : `Faltan ${faltan.length} datos para mandar la prueba`}
				</CardTitle>
				<p className="text-xs leading-relaxed text-muted-foreground">
					Firmar la prueba es el punto de no retorno: después se compra papel y se graban
					planchas. Por eso la ficha tiene que estar entera <strong>antes</strong>, no después.
				</p>
			</CardHeader>

			<CardContent className="space-y-4">
				{lista ? (
					<p className="text-sm text-emerald-700 dark:text-emerald-400">
						La <span className="font-mono font-semibold">{otNumber}</span> tiene todo lo que
						hace falta para producirla. El precio de la prueba es firme.
					</p>
				) : (
					<ul className="space-y-2">
						{faltan.map((g) => {
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
								</li>
							);
						})}
					</ul>
				)}

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
