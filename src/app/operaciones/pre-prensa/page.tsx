'use client';

/**
 * Pre-Prensa: la compuerta antes del punto de no retorno.
 *
 * Una OT llega acá con la mitad de la ficha — el vendedor juntó lo que se junta
 * al teléfono. Lo que falta es lo que sólo se sabe acá: qué papel exactamente,
 * cómo se monta, con qué arte.
 *
 * La pantalla ordena por lo que MENOS le falta, no por fecha. Las que se pueden
 * cerrar hoy van arriba: es la lista de trabajo de quien está en Pre-Prensa, no
 * un informe de estado.
 */

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
	quoted_price: number | null;
	firm_price: number | null;
}

function PrePrensaInner() {
	const { data, isLoading, refetch } = useQuery<{ trabajos: Trabajo[]; diagnostics: { total: number; listas: number } }>({
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
	const { total = 0, listas = 0 } = data?.diagnostics ?? {};

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
			</dl>

			{trabajos.map((t) => (
				<div key={t.ot_id} className="space-y-1">
					<div className="flex flex-wrap items-baseline gap-x-2 px-1">
						<span className="font-mono font-semibold text-foreground">{t.ot_number}</span>
						<span className="text-sm text-muted-foreground">{t.client_name}</span>
						{t.deadline && (
							<span className="ml-auto text-xs text-muted-foreground">
								{/* `deadline` puede venir como fecha suelta («2026-08-20») o como
								    marca de tiempo completa, según por dónde se haya escrito.
								    Concatenar la hora a la segunda daba «Invalid Date». */}
								entrega {new Date(t.deadline.length <= 10 ? `${t.deadline}T00:00:00` : t.deadline)
									.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
							</span>
						)}
					</div>
					<FichaPrePrensa
						otId={t.ot_id}
						otNumber={t.ot_number}
						spec={t.spec}
						quotedPrice={t.quoted_price}
						firmPrice={t.firm_price}
						onChanged={() => refetch()}
					/>
				</div>
			))}
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
