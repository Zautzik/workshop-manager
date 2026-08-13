'use client';

/**
 * Registrar las maquetas de una OT.
 *
 * ── Lo que este formulario NO pide ──────────────────────────────────────────
 *
 * No pide el precio del pliego, ni el del clic de la digital, ni la tarifa de
 * quien la armó. Todo eso ya lo sabe el sistema: la maqueta se hace con el
 * sustrato REAL del trabajo —para eso existe, que el cliente lo toque— y la mano
 * de obra es la tarifa de terminaciones del catálogo.
 *
 * Pide dos números por vuelta: cuántos pliegos y cuántas horas. Es lo que quien
 * armó la maqueta tiene en la cabeza al terminar. Un formulario que pide seis
 * campos para un dato que se anota de memoria no se llena, y un costo que no se
 * anota es un costo que desaparece.
 *
 * ── Y muestra la proporción, porque es el hallazgo ──────────────────────────
 *
 * Cuatro pliegos de cartulina no son nada; dos horas de alguien armándola a mano
 * sí. Ver que la mano de obra es tres veces el material es lo que cambia la
 * conversación sobre cuándo empezar a cobrarlas.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCLP } from '@/lib/format';
import { maquetaCost, type MaquetaRound } from '@/lib/maqueta';

interface Props {
	otId: string;
	otNumber: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved?: () => void;
}

interface Vuelta { sheets: number; handHours: number }

/** Una vuelta típica: cuatro pliegos y dos horas de armado. */
const VUELTA_TIPICA: Vuelta = { sheets: 4, handHours: 2 };

export function MaquetasDialog({ otId, otNumber, open, onOpenChange, onSaved }: Props) {
	const [vueltas, setVueltas] = useState<Vuelta[]>([{ ...VUELTA_TIPICA }]);
	const [troquel, setTroquel] = useState(0);
	const [guardando, setGuardando] = useState(false);

	// Las tarifas del trabajo, para poder mostrar el costo mientras se escribe.
	const { data: registrado } = useQuery<{
		lines: any[];
		total: number;
		defaults: { costPerSheet: number; digitalPerSheet: number; hourlyRate: number };
	}>({
		queryKey: ['maquetas', otId],
		queryFn: async () => {
			const r = await fetch(`/api/ots/${otId}/maquetas`, { credentials: 'include' });
			if (!r.ok) throw new Error('No se pudo leer');
			return r.json();
		},
		enabled: open,
	});

	// Se calcula con la MISMA función que usa el servidor, así que lo que el
	// formulario muestra es exactamente lo que se va a guardar.
	const previo = useMemo(() => {
		// Las tarifas son las DEL TRABAJO, no unas genéricas. La primera versión
		// previsualizaba con una cartulina de $490 el pliego y el servidor
		// guardaba con el adhesivo real de $220: el formulario mostraba $34.680 y
		// se registraban $32.520. Un número que cambia al guardar enseña a no
		// creerle a la pantalla.
		const d = registrado?.defaults;
		const rounds: MaquetaRound[] = vueltas.map((v) => ({
			sheets: v.sheets,
			handHours: v.handHours,
			costPerSheet: d?.costPerSheet ?? 0,
			digitalPerSheet: d?.digitalPerSheet ?? 0,
			hourlyRate: d?.hourlyRate ?? 0,
		}));
		return maquetaCost({ rounds, sampleDieCost: troquel });
	}, [vueltas, troquel, registrado?.defaults]);

	const guardar = async () => {
		setGuardando(true);
		const res = await fetch(`/api/ots/${otId}/maquetas`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				rounds: vueltas.filter((v) => v.sheets > 0 || v.handHours > 0),
				sampleDieCost: troquel > 0 ? troquel : undefined,
			}),
		});
		setGuardando(false);
		const b = await res.json().catch(() => null);
		if (!res.ok) { toast.error(b?.error ?? 'No se pudo guardar'); return; }
		toast.success(`Maquetas registradas: ${formatCLP(b.resumen.total)} al costo real de la OT`);
		onSaved?.();
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Maquetas de la {otNumber}</DialogTitle>
				</DialogHeader>

				<p className="text-xs leading-relaxed text-muted-foreground">
					El sustrato, el clic de la digital y la tarifa de quien la armó salen del
					trabajo y del catálogo. Acá van los dos números que se saben al terminar.
				</p>

				<div className="space-y-2">
					{vueltas.map((v, i) => (
						<div key={i} className="flex items-end gap-2 rounded-md border border-border p-2">
							<span className="pb-2 text-xs font-medium text-muted-foreground">{i + 1}ª</span>
							<div className="flex-1">
								<Label className="text-xs">Pliegos</Label>
								<Input
									type="number" min={0} value={v.sheets}
									onChange={(e) => setVueltas((xs) => xs.map((x, k) => k === i ? { ...x, sheets: Number(e.target.value) || 0 } : x))}
								/>
							</div>
							<div className="flex-1">
								<Label className="text-xs">Horas de armado</Label>
								<Input
									type="number" min={0} step={0.5} value={v.handHours}
									onChange={(e) => setVueltas((xs) => xs.map((x, k) => k === i ? { ...x, handHours: Number(e.target.value) || 0 } : x))}
								/>
							</div>
							{vueltas.length > 1 && (
								<Button
									variant="ghost" size="sm" className="h-9 px-2"
									aria-label={`Quitar la vuelta ${i + 1}`}
									onClick={() => setVueltas((xs) => xs.filter((_, k) => k !== i))}
								>
									<Trash2 className="h-4 w-4 text-muted-foreground" />
								</Button>
							)}
						</div>
					))}

					<Button variant="outline" size="sm" className="w-full" onClick={() => setVueltas((xs) => [...xs, { ...VUELTA_TIPICA }])}>
						<Plus className="mr-1 h-3 w-3" /> Otra vuelta
					</Button>
				</div>

				<div>
					<Label className="text-xs">Troquel de muestra (si hubo)</Label>
					<Input type="number" min={0} value={troquel} onChange={(e) => setTroquel(Number(e.target.value) || 0)} />
					<p className="mt-1 text-[11px] text-muted-foreground">
						No se repite entre vueltas: se corta una vez y la segunda maqueta lo reutiliza.
					</p>
				</div>

				{/* La proporción es el hallazgo: cuatro pliegos de cartulina no son
				    nada, dos horas de alguien armándola sí. */}
				<div className="rounded-md border border-border bg-muted/30 p-3">
					<div className="grid grid-cols-3 gap-2 text-center">
						<div>
							<p className="text-[11px] uppercase tracking-wide text-muted-foreground">Material</p>
							<p className="text-sm font-semibold tabular-nums">{formatCLP(previo.material + previo.printing)}</p>
						</div>
						<div>
							<p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mano de obra</p>
							<p className="text-sm font-semibold tabular-nums">{formatCLP(previo.labor)}</p>
						</div>
						<div>
							<p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
							<p className="text-sm font-bold tabular-nums text-primary">{formatCLP(previo.total)}</p>
						</div>
					</div>
					{previo.labor > previo.material + previo.printing && previo.total > 0 && (
						<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
							La mano de obra pesa más que el material — es lo que hace que una maqueta
							sorprenda, y por qué {previo.rounds > 1
								? `${previo.rounds} vueltas cuestan lo que cuestan`
								: 'una vuelta cuesta lo que cuesta'}.
						</p>
					)}
				</div>

				{(registrado?.total ?? 0) > 0 && (
					<p className="text-xs text-muted-foreground">
						Ya hay {formatCLP(registrado!.total)} registrados en esta OT. Guardar los reemplaza.
					</p>
				)}

				<div className="flex gap-2">
					<Button className="flex-1" onClick={guardar} disabled={guardando || !registrado || previo.total === 0}>
						{guardando ? 'Guardando…' : 'Cargar al costo real'}
					</Button>
					<Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
