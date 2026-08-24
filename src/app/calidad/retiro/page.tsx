'use client';

import { useMutation } from '@tanstack/react-query';
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Package,
	Search,
	ShieldAlert,
	Truck,
	Users,
} from 'lucide-react';
import { useState } from 'react';

import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TraceBackward } from '@/lib/recall-trace';

type Modo = 'ot' | 'guia';

/**
 * Simulacro de retiro.
 *
 * La pantalla que un auditor pide ver funcionando, y la que se usa de verdad el
 * día que llama un cliente enojado. Se entra por lo que se tiene a mano —un
 * número de guía, un número de OT— y sale la cadena completa.
 *
 * ── Por qué el alcance va primero ───────────────────────────────────────────
 *
 * Quien está decidiendo si retira o no necesita una sola cosa en los primeros
 * diez segundos: cuánto abarca. Los lotes, las fechas y los certificados
 * importan después. Poner la tabla arriba y el resumen abajo obliga a leer para
 * entender el tamaño del problema, que es lo contrario de lo que hace falta.
 *
 * ── Por qué los avisos van antes que los datos ──────────────────────────────
 *
 * Un simulacro no se aprueba mostrando la cadena: se aprueba mostrando que está
 * COMPLETA. Si falta un eslabón, decirlo primero es más honesto —y más útil—
 * que dejar que el auditor lo encuentre revisando.
 */
function RetiroInner() {
	const [modo, setModo] = useState<Modo>('guia');
	const [valor, setValor] = useState('');

	const buscar = useMutation({
		mutationFn: async () => {
			const q = new URLSearchParams({ [modo]: valor.trim() });
			const res = await fetch(`/api/recall/hacia-atras?${q}`);
			if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo trazar');
			return res.json() as Promise<{ trace: TraceBackward; alcance: string }>;
		},
	});

	const t = buscar.data?.trace;

	return (
		<div className="space-y-4 p-6 md:p-8">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Simulacro de retiro</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Del reclamo al lote, y del lote a todo lo que salió con él.
				</p>
			</div>

			<Card>
				<CardContent className="flex flex-wrap items-end gap-2 pt-5">
					<div className="flex gap-1">
						{([
							{ k: 'guia' as const, t: 'Guía de despacho' },
							{ k: 'ot' as const, t: 'Número de OT' },
						]).map((m) => (
							<button
								key={m.k}
								type="button"
								onClick={() => setModo(m.k)}
								className={`rounded-md border px-3 py-2 text-sm transition-colors ${
									modo === m.k
										? 'border-primary bg-primary/10 font-medium text-primary'
										: 'border-border text-muted-foreground hover:border-primary/40'
								}`}
							>
								{m.t}
							</button>
						))}
					</div>
					<div className="min-w-[200px] flex-1">
						<Label htmlFor="valor" className="text-xs">
							{modo === 'guia' ? 'Número de guía' : 'Número de OT'}
						</Label>
						<Input
							id="valor"
							value={valor}
							onChange={(e) => setValor(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && valor.trim() && buscar.mutate()}
							placeholder={modo === 'guia' ? 'G-0044' : 'OT-40879 (o sólo 40879)'}
							className="h-10 font-mono"
						/>
					</div>
					<Button
						className="h-10"
						disabled={!valor.trim() || buscar.isPending}
						onClick={() => buscar.mutate()}
					>
						<Search className="mr-2 h-4 w-4" />
						{buscar.isPending ? 'Trazando…' : 'Trazar'}
					</Button>
				</CardContent>
			</Card>

			{buscar.isError && (
				<p className="text-sm text-red-600 dark:text-red-400">{String(buscar.error)}</p>
			)}

			{t && (
				<>
					{/* El tamaño del problema, en una frase y arriba de todo. */}
					<Card className="border-primary/40 bg-primary/5">
						<CardContent className="py-4">
							<p className="text-base font-medium text-foreground">{buscar.data!.alcance}</p>
							{t.clientsReached.length > 0 && (
								<p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
									<Users className="h-3.5 w-3.5" />
									{t.clientsReached.join(' · ')}
								</p>
							)}
						</CardContent>
					</Card>

					{/* Lo que falta en la cadena, antes que la cadena. */}
					{t.warnings.length > 0 && (
						<Card className="border-amber-500/40 bg-amber-500/5">
							<CardContent className="space-y-1 py-3">
								{t.warnings.map((w) => (
									<p
										key={w}
										className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300"
									>
										<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
										{w}
									</p>
								))}
							</CardContent>
						</Card>
					)}

					<div className="grid gap-4 lg:grid-cols-2">
						{/* Hacia atrás */}
						<section>
							<h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
								<ArrowLeft className="h-4 w-4 text-muted-foreground" />
								De qué está hecho
							</h2>
							<div className="space-y-1.5">
								{t.lots.length === 0 && (
									<p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
										Sin material trazado.
									</p>
								)}
								{t.lots.map((l) => (
									<div key={l.lotId} className="rounded-lg border border-border bg-card px-3 py-2">
										<div className="flex flex-wrap items-baseline gap-x-2">
											<Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
											<span className="font-mono text-sm font-semibold">{l.lotNumber}</span>
											<span className="text-xs text-muted-foreground">{l.material}</span>
											<span className="ml-auto text-xs tabular-nums text-muted-foreground">
												{l.quantityInSubject.toLocaleString('es-CL')}
											</span>
										</div>
										{/* La cadena hasta el proveedor, en una línea: es lo que el
										    auditor sigue con el dedo. */}
										<p className="mt-1 text-[11px] text-muted-foreground">
											{l.ocNumber ?? 'sin OC'} · {l.supplier ?? 'sin proveedor'} ·{' '}
											{l.certificationCode ? `cert ${l.certificationCode}` : 'sin certificado'}
											{l.certificationExpiresOn ? ` hasta ${l.certificationExpiresOn}` : ''}
										</p>
										{l.deviationAtUse && (
											<p className="mt-1 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
												<ShieldAlert className="h-3 w-3" />
												Entró con desviación autorizada
											</p>
										)}
									</div>
								))}
							</div>
						</section>

						{/* Hacia adelante */}
						<section>
							<h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
								<ArrowRight className="h-4 w-4 text-muted-foreground" />
								Qué más salió con ese material
							</h2>
							<div className="space-y-1.5">
								{t.blastRadius.length === 0 ? (
									<p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
										Ese material no se usó en ningún otro trabajo.
									</p>
								) : (
									t.blastRadius.map((o) => (
										<div key={o.otId} className="rounded-lg border border-border bg-card px-3 py-2">
											<div className="flex flex-wrap items-baseline gap-x-2">
												<span className="font-mono text-sm font-semibold">{o.otNumber}</span>
												<span className="text-xs text-muted-foreground">{o.clientName}</span>
											</div>
											{/* Lo despachado ya está afuera; lo que no salió se puede
											    retener, que es la acción más barata que existe. */}
											{o.guides.length > 0 ? (
												<p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
													<Truck className="h-3 w-3" />
													Despachado: {o.guides.map((g) => g.guideNumber).join(', ')}
												</p>
											) : (
												<p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
													Todavía no se despachó — se puede retener.
												</p>
											)}
										</div>
									))
								)}
							</div>
						</section>
					</div>
				</>
			)}
		</div>
	);
}

export default function RetiroPage() {
	return (
		<ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
			<RetiroInner />
		</ProtectedRoute>
	);
}
