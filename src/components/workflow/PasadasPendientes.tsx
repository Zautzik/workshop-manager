'use client';

/**
 * Las pasadas que quedaron sin cerrar, y dónde cerrarlas.
 *
 * Mover una tarjeta no exige declarar cuánto tomó la etapa. Lo que reemplaza a
 * ese bloqueo es una deuda visible —el anillo ámbar en el hexágono— y esta
 * ventana, que es donde se paga. Sin ella la regla sería una trampa: la
 * compuerta de despacho diría «falta cerrar el troquelado» y no habría dónde
 * hacerlo.
 *
 * ── Por qué acá las horas sí son obligatorias ───────────────────────────────
 *
 * Porque cambió el objetivo de la acción. Arrastrar una tarjeta busca que el
 * trabajo avance, y no puede quedar rehén de un dato que quizá tenga otra
 * persona. Abrir esta ventana busca exactamente una cosa: poner el número. Un
 * cierre sin horas no cerraría nada.
 */

import { useEffect, useState } from 'react';
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Clock, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { otStatusLabel } from '@/lib/status-labels';

interface Pasada {
	id: string;
	workflow_step: string;
	to_status: string | null;
	hours: number | null;
	units_moved: number | null;
	created_at: string;
}

interface Props {
	ot: { id: string; ot_number: string; client_name?: string } | null;
	onOpenChange: (open: boolean) => void;
	/** Se llama tras cerrar cada pasada, para refrescar el tablero. */
	onClosed: () => void;
}

const fecha = (iso: string) =>
	new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });

export function PasadasPendientes({ ot, onOpenChange, onClosed }: Props) {
	const { toast } = useToast();
	const [pasadas, setPasadas] = useState<Pasada[]>([]);
	const [cargando, setCargando] = useState(false);
	const [guardando, setGuardando] = useState<string | null>(null);
	// Un borrador por pasada: se pueden cerrar dos etapas en la misma visita y
	// cada una tiene sus propias horas.
	const [borrador, setBorrador] = useState<Record<string, { hours: string; merma: string; notas: string }>>({});

	useEffect(() => {
		if (!ot) return;
		let cancelled = false;
		setCargando(true);
		fetch(`/api/ots/${ot.id}/stage-reports`, { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : []))
			.then((rows: Pasada[]) => {
				if (cancelled) return;
				setPasadas(Array.isArray(rows) ? rows.filter((p) => p.hours == null) : []);
			})
			.catch(() => { if (!cancelled) setPasadas([]); })
			.finally(() => { if (!cancelled) setCargando(false); });
		return () => { cancelled = true; };
	}, [ot]);

	const cerrar = async (p: Pasada) => {
		if (!ot) return;
		const d = borrador[p.id] ?? { hours: '', merma: '', notas: '' };
		const horas = Number(d.hours);
		if (!Number.isFinite(horas) || horas <= 0) {
			toast({
				title: 'Faltan las horas',
				description: `Decí cuánto tomó ${otStatusLabel(p.workflow_step)} para poder cerrarla.`,
				variant: 'destructive',
			});
			return;
		}

		setGuardando(p.id);
		try {
			const res = await fetch(`/api/ots/${ot.id}/stage-reports`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					id: p.id,
					hours: horas,
					merma_sheets: d.merma === '' ? null : Math.trunc(Number(d.merma)),
					issues: d.notas.trim() || null,
				}),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				toast({
					title: 'No se pudo cerrar',
					description: body?.error ?? 'Intentá de nuevo.',
					variant: 'destructive',
				});
				return;
			}
			// Fuera de la lista: lo que queda en pantalla es lo que todavía se debe.
			setPasadas((prev) => prev.filter((x) => x.id !== p.id));
			toast({
				title: `${otStatusLabel(p.workflow_step)} cerrada`,
				description: `${horas} h en ${ot.ot_number}.`,
			});
			onClosed();
		} finally {
			setGuardando(null);
		}
	};

	const VACIO = { hours: '', merma: '', notas: '' };
	const set = (id: string, patch: Partial<typeof VACIO>) =>
		setBorrador((prev) => ({ ...prev, [id]: { ...VACIO, ...prev[id], ...patch } }));

	return (
		<Dialog open={!!ot} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Clock className="h-5 w-5 text-amber-500" />
						Pasadas sin cerrar — {ot?.ot_number}
					</DialogTitle>
					<DialogDescription>
						{ot?.client_name}
						{' · '}
						La OT pasó por estas etapas y todavía no se dijo cuánto tomaron. Se puede
						cerrar acá, o el operario lo manda por WhatsApp.
					</DialogDescription>
				</DialogHeader>

				{cargando && (
					<p className="text-sm text-muted-foreground py-6 text-center">Buscando…</p>
				)}

				{!cargando && pasadas.length === 0 && (
					<div className="flex items-center gap-2 py-6 justify-center text-sm text-emerald-600 dark:text-emerald-400">
						<Check className="h-4 w-4" />
						No queda ninguna pasada abierta en esta OT.
					</div>
				)}

				<div className="space-y-3">
					{pasadas.map((p) => {
						const d = borrador[p.id] ?? { hours: '', merma: '', notas: '' };
						return (
							<div key={p.id} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
								<div className="flex items-center gap-2 flex-wrap">
									<Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
										{otStatusLabel(p.workflow_step)}
									</Badge>
									<span className="text-xs text-muted-foreground">
										{fecha(p.created_at)}
										{p.to_status && ` · pasó a ${otStatusLabel(p.to_status)}`}
										{p.units_moved != null && ` · ${p.units_moved.toLocaleString('es-CL')} uds.`}
									</span>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-[120px_140px_1fr] gap-2">
									<div>
										<Label htmlFor={`h-${p.id}`} className="text-xs">
											Horas <span className="text-red-400">*</span>
										</Label>
										<Input
											id={`h-${p.id}`}
											type="number"
											inputMode="decimal"
											min={0}
											step="0.25"
											placeholder="Ej: 4.5"
											value={d.hours}
											onChange={(e) => set(p.id, { hours: e.target.value })}
											className="h-9 text-sm"
										/>
									</div>
									<div>
										<Label htmlFor={`m-${p.id}`} className="text-xs">Merma (pliegos)</Label>
										<Input
											id={`m-${p.id}`}
											type="number"
											inputMode="numeric"
											min={0}
											placeholder="0"
											value={d.merma}
											onChange={(e) => set(p.id, { merma: e.target.value })}
											className="h-9 text-sm"
										/>
									</div>
									<div>
										<Label htmlFor={`n-${p.id}`} className="text-xs">Qué pasó</Label>
										<Textarea
											id={`n-${p.id}`}
											rows={1}
											placeholder="Paradas, atascos, algo que se rehízo…"
											value={d.notas}
											onChange={(e) => set(p.id, { notas: e.target.value })}
											className="text-sm min-h-9"
										/>
									</div>
								</div>

								<div className="flex justify-end">
									<Button size="sm" onClick={() => cerrar(p)} disabled={guardando === p.id}>
										{guardando === p.id
											? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Cerrando…</>
											: <><Check className="h-3.5 w-3.5 mr-1" />Cerrar pasada</>}
									</Button>
								</div>
							</div>
						);
					})}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar ventana</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
