'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer, ShieldAlert, Lock } from 'lucide-react';
import { useState } from 'react';

import ProtectedRoute from '@/components/ProtectedRoute';
import { EtiquetaLote, type LoteImprimible } from '@/components/bodega/EtiquetaLote';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { certStatus, CERT_LABELS } from '@/lib/purchasing';

/**
 * Los lotes en bodega.
 *
 * Dos trabajos que parecen uno: **imprimir las etiquetas** de lo que acaba de
 * llegar, y **ver qué no se puede usar**. Van juntos porque son el mismo
 * momento — se recibe un pallet, se le pega la etiqueta, y ahí mismo se
 * descubre que el certificado vence en dos semanas.
 *
 * La selección para imprimir es múltiple a propósito: una recepción son varios
 * lotes y nadie va a entrar de a uno. Se imprimen en una hoja, se cortan y se
 * pegan.
 */
function LotesInner() {
	const [elegidos, setElegidos] = useState<Set<string>>(new Set());

	const { data: lotes = [], isLoading } = useQuery({
		queryKey: ['lotes-bodega'],
		queryFn: async () => {
			const res = await fetch('/api/inventory/lots?limit=200');
			if (!res.ok) return [] as LoteImprimible[];
			const b = await res.json();
			return (b.data ?? b.lots ?? []) as LoteImprimible[];
		},
	});

	const alternar = (id: string) =>
		setElegidos((s) => {
			const n = new Set(s);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});

	const paraImprimir = lotes.filter((l) => elegidos.has(l.id));

	// Los que no se pueden usar arriba: son trabajo, no información.
	const conProblema = lotes.filter((l) => {
		const e = certStatus(l.certification_expires_on);
		return e === 'vencido' || e === 'sin_certificado' || (l as { blocked_reason?: string }).blocked_reason;
	});

	return (
		<div className="space-y-4 p-6 md:p-8">
			<div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Lotes en bodega</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						La etiqueta es lo que conecta el pallet con el sistema. Sin ella, nadie puede
						registrar qué papel usó.
					</p>
				</div>
				<Button disabled={elegidos.size === 0} onClick={() => window.print()}>
					<Printer className="mr-2 h-4 w-4" />
					Imprimir {elegidos.size > 0 ? `${elegidos.size} ` : ''}
					{elegidos.size === 1 ? 'etiqueta' : 'etiquetas'}
				</Button>
			</div>

			{conProblema.length > 0 && (
				<Card className="border-red-500/40 bg-red-500/5 print:hidden">
					<CardContent className="flex items-start gap-2 py-3">
						<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
						<p className="text-sm text-red-700 dark:text-red-400">
							<span className="font-semibold">{conProblema.length}</span>{' '}
							{conProblema.length === 1 ? 'lote no puede' : 'lotes no pueden'} entrar a producción
							sin autorización escrita. Están marcados abajo.
						</p>
					</CardContent>
				</Card>
			)}

			{/* La lista. En pantalla se elige; al imprimir desaparece. */}
			<div className="space-y-1.5 print:hidden">
				{isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
				{!isLoading && lotes.length === 0 && (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No hay lotes. Entran al recibir una orden de compra.
					</p>
				)}
				{lotes.map((l) => {
					const estado = certStatus(l.certification_expires_on);
					const retenido = (l as { blocked_reason?: string | null }).blocked_reason;
					const problema = estado === 'vencido' || estado === 'sin_certificado' || !!retenido;
					return (
						<label
							key={l.id}
							className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
								elegidos.has(l.id) ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'
							}`}
						>
							<input
								type="checkbox"
								checked={elegidos.has(l.id)}
								onChange={() => alternar(l.id)}
								className="h-4 w-4"
							/>
							<span className="font-mono text-sm font-semibold">{l.lot_number}</span>
							<span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
								{l.inventory_items?.name ?? '—'}
								{l.supplier_name ? ` · ${l.supplier_name}` : ''}
							</span>
							<span className="text-xs tabular-nums text-muted-foreground">
								{Number(l.quantity_received ?? 0).toLocaleString('es-CL')}
							</span>
							{retenido && (
								<span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300">
									<Lock className="h-3 w-3" /> retenido
								</span>
							)}
							<span
								className={`rounded-full px-2 py-0.5 text-[11px] ${
									problema
										? 'bg-red-500/15 text-red-700 dark:text-red-400'
										: estado === 'por_vencer'
											? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
											: 'text-muted-foreground'
								}`}
							>
								{CERT_LABELS[estado]}
							</span>
						</label>
					);
				})}
			</div>

			{/* La hoja de etiquetas. Sólo existe al imprimir. */}
			<div className="hidden print:flex print:flex-wrap print:gap-2">
				{paraImprimir.map((l) => (
					<EtiquetaLote key={l.id} lote={l} />
				))}
			</div>

			<style jsx global>{`
				@page {
					size: A4;
					margin: 8mm;
				}
				@media print {
					body {
						background: white;
					}
					.etiqueta {
						break-inside: avoid;
					}
				}
			`}</style>
		</div>
	);
}

export default function LotesPage() {
	return (
		<ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor', 'technician']}>
			<LotesInner />
		</ProtectedRoute>
	);
}
