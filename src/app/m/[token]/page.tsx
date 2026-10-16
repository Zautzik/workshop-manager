'use client';

/**
 * Mantenciones pendientes de una máquina, desde el QR pegado en el equipo.
 * SIN SESIÓN.
 *
 * ── Qué cambió y por qué ──────────────────────────────────────────────────
 *
 * El QR apuntaba a `/equipos/lectura/<machine_id>`, detrás de
 * `ProtectedRoute`: el operario escaneaba en el taller y aterrizaba en /login.
 * Y ofrecía dos caminos (anotar el contador o ver mantenciones). Por decisión
 * del dueño (2026-10-16) ahora no pide sesión y hace una sola cosa: trabajar
 * las mantenciones pendientes de esa máquina.
 *
 * Lo que autoriza es `machines.qr_token`, el token de la etiqueta, no una
 * cuenta. `/m/` está en `isPublicRoute` y en `isFullscreenRoute` de AppShell —
 * lo primero es imprescindible (si no, rebota a /login, el mismo bug que tenía
 * `/track/`) y lo segundo evita dibujar el nav de la planta alrededor de una
 * pantalla de teléfono.
 *
 * ── Por qué es un componente aparte y no reusa MachinePendingMaintenance ──
 *
 * Porque esa pantalla puede MÁS: crea órdenes desde una pauta vencida, y está
 * cableada a los hooks con sesión que piden TODAS las órdenes abiertas del
 * taller para filtrarlas en el navegador. Servir eso sin sesión haría que la
 * etiqueta de una máquina expusiera las órdenes de todas.
 *
 * Acá la superficie de escritura es a propósito la mínima: arrancar, marcar
 * ítems y cerrar una orden que YA existe. Una pauta vencida sin orden se
 * muestra, pero no se puede convertir en orden desde la etiqueta — el cron lo
 * hace solo, y si falta, es una conversación con el supervisor.
 *
 * La lógica de dominio sí se comparte: `deriveChecklistItems` es la misma
 * función que usa el escritorio, y el PATCH entra por `applyWorkOrderUpdate` a
 * través de `/api/maquina/[token]/ordenes/[orderId]`. Lo que se parece entre
 * las dos pantallas es la TARJETA de la orden; si una de las dos cambia de
 * forma, conviene extraerla a un componente presentacional en vez de dejarlas
 * divergir.
 */

import { use, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Wrench,
	TriangleAlert,
	CheckCircle2,
	Play,
	Clock,
	CalendarClock,
	Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { deriveChecklistItems, type CompletedChecklistItem } from '@/lib/checklist-items';
import { machineTypeLabel } from '@/types/machine-type';

interface Respuesta {
	// Sin `id`: la ruta publica no lo devuelve (es un UUID interno que esta
	// pantalla no dibuja).
	machine: {
		name: string;
		type: string;
		usage_counter: number | null;
		usage_unit: string | null;
	};
	orders: any[];
	schedules: any[];
}

function useEtiqueta(token: string) {
	return useQuery<Respuesta>({
		queryKey: ['etiqueta', token],
		queryFn: async () => {
			const res = await fetch(`/api/maquina/${encodeURIComponent(token)}`);
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error(body?.error ?? 'No se pudo leer la etiqueta');
			return body as Respuesta;
		},
		// El taller es ruidoso y el teléfono se bloquea: que al volver muestre el
		// estado real y no el de hace diez minutos.
		refetchOnWindowFocus: true,
	});
}

function TarjetaOrden({ token, orden }: { token: string; orden: any }) {
	const { toast } = useToast();
	const qc = useQueryClient();
	const [abierta, setAbierta] = useState(false);
	const { items: itemsIniciales, tracked } = useMemo(() => deriveChecklistItems(orden), [orden]);
	const [items, setItems] = useState<CompletedChecklistItem[]>(itemsIniciales);

	const editable = tracked && (orden.status === 'pending' || orden.status === 'in_progress');

	const patch = useMutation({
		mutationFn: async (body: Record<string, unknown>) => {
			const res = await fetch(
				`/api/maquina/${encodeURIComponent(token)}/ordenes/${encodeURIComponent(orden.id)}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				},
			);
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'No se pudo actualizar la orden');
			return json;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ['etiqueta', token] }),
		onError: (e: Error) =>
			toast({ title: 'No se guardó', description: e.message, variant: 'destructive' }),
	});

	const arrancar = () =>
		patch.mutate({ status: 'in_progress', started_at: new Date().toISOString() });

	const marcar = (itemId: string) => {
		const ahora = new Date().toISOString();
		const actualizados = items.map((it) =>
			it.item_id === itemId
				? { ...it, completed: !it.completed, completed_at: !it.completed ? ahora : null }
				: it,
		);
		setItems(actualizados);
		patch.mutate({ completed_items: actualizados });
	};

	const cerrar = () => {
		if (items.length > 0 && !items.every((it) => it.completed)) {
			toast({
				title: 'Faltan tareas',
				description: 'Marcá todos los ítems antes de cerrar la orden.',
				variant: 'destructive',
			});
			return;
		}
		const minutos = items.reduce((s, it) => s + (it.estimated_minutes ?? 0), 0);
		patch.mutate({
			status: 'completed',
			completed_at: new Date().toISOString(),
			actual_minutes: minutos > 0 ? minutos : undefined,
			completed_items: items,
		});
	};

	const hechos = items.filter((it) => it.completed).length;

	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<button
				type="button"
				onClick={() => setAbierta((v) => !v)}
				className="flex w-full items-start gap-3 text-left"
			>
				<Wrench className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<p className="font-medium text-sm">
						{orden.maintenance_checklists?.name ?? orden.title ?? 'Mantención preventiva'}
					</p>
					<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<Badge variant={orden.status === 'in_progress' ? 'default' : 'outline'} className="text-[10px]">
							{orden.status === 'in_progress' ? 'En curso' : 'Pendiente'}
						</Badge>
						{items.length > 0 && (
							<span>
								{hechos} de {items.length} ítems
							</span>
						)}
						{orden.scheduled_date && <span>Programada {orden.scheduled_date}</span>}
					</div>
				</div>
			</button>

			{abierta && (
				<div className="mt-4 space-y-3 border-t border-border pt-3">
					{items.length === 0 && (
						<p className="text-xs text-muted-foreground">
							Esta orden no tiene lista de tareas. Se puede cerrar directamente.
						</p>
					)}

					{items.map((it) => (
						<label key={it.item_id} className="flex items-start gap-3 text-sm">
							<Checkbox
								checked={it.completed}
								disabled={!editable || patch.isPending}
								onCheckedChange={() => marcar(it.item_id)}
								className="mt-0.5"
							/>
							<span className={it.completed ? 'text-muted-foreground line-through' : ''}>
								{it.title ?? it.item_id}
								{it.estimated_minutes ? (
									<span className="ml-1 text-xs text-muted-foreground">
										({it.estimated_minutes} min)
									</span>
								) : null}
							</span>
						</label>
					))}

					<div className="flex gap-2 pt-1">
						{orden.status === 'pending' && (
							<Button size="sm" onClick={arrancar} disabled={patch.isPending} className="flex-1">
								<Play className="mr-1.5 h-4 w-4" /> Arrancar
							</Button>
						)}
						{orden.status === 'in_progress' && (
							<Button size="sm" onClick={cerrar} disabled={patch.isPending} className="flex-1">
								<CheckCircle2 className="mr-1.5 h-4 w-4" /> Cerrar orden
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export default function EtiquetaMaquinaPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = use(params);
	const { data, isLoading, error } = useEtiqueta(token);

	if (isLoading) {
		return (
			<div className="mx-auto max-w-md space-y-3 p-4">
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-28 w-full" />
			</div>
		);
	}

	// Un token inválido y un error de red se ven distinto a propósito: el primero
	// significa «esta etiqueta no sirve», el segundo «volvé a intentar».
	if (error || !data) {
		return (
			<div className="mx-auto max-w-md p-8 text-center">
				<TriangleAlert className="mx-auto h-10 w-10 text-amber-500" />
				<p className="mt-3 font-medium text-foreground">No se pudo abrir esta etiqueta</p>
				<p className="mt-1 text-sm text-muted-foreground">
					{(error as Error)?.message ?? 'Etiqueta no válida'}
				</p>
				<p className="mt-4 text-xs text-muted-foreground">
					Si el QR está gastado o la máquina cambió de etiqueta, pedí una nueva en
					administración.
				</p>
			</div>
		);
	}

	const { machine, orders, schedules } = data;
	const vencidasSinOrden = schedules.filter(
		(s) => s.due?.status === 'vencida' && !orders.some((o) => o.schedule_id === s.id),
	);

	return (
		<div className="mx-auto max-w-md space-y-4 p-4 pb-16">
			<header className="rounded-lg border border-border bg-card p-4">
				<h1 className="text-lg font-bold leading-tight text-foreground">{machine.name}</h1>
				<div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
					<span>{machineTypeLabel(machine.type as never)}</span>
					{machine.usage_counter != null && (
						<span className="inline-flex items-center gap-1">
							<Gauge className="h-3.5 w-3.5" />
							{machine.usage_counter.toLocaleString('es-CL')}
							{machine.usage_unit ? ` ${machine.usage_unit}` : ''}
						</span>
					)}
				</div>
				<p className="mt-2 text-xs text-muted-foreground">Mantenciones pendientes de esta máquina</p>
			</header>

			{orders.length === 0 && vencidasSinOrden.length === 0 && (
				<div className="rounded-lg border border-border bg-card p-8 text-center">
					<CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
					<p className="mt-3 font-medium text-foreground">Sin mantenciones pendientes</p>
					<p className="mt-1 text-sm text-muted-foreground">Esta máquina está al día.</p>
				</div>
			)}

			{orders.length > 0 && (
				<section className="space-y-3">
					<h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Clock className="h-4 w-4" /> Órdenes abiertas ({orders.length})
					</h2>
					{orders.map((o) => (
						<TarjetaOrden key={o.id} token={token} orden={o} />
					))}
				</section>
			)}

			{vencidasSinOrden.length > 0 && (
				<section className="space-y-2">
					<h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<CalendarClock className="h-4 w-4" /> Vencidas sin orden ({vencidasSinOrden.length})
					</h2>
					{/*
					  Se muestran pero no se pueden convertir en orden desde la etiqueta.
					  Crear una orden es una escritura más que no hace falta exponer sin
					  sesión: el cron diario las convierte solo, y si no lo hizo —por
					  ejemplo porque la pauta no tiene checklist— es algo que el
					  supervisor tiene que mirar, no algo que resolver frente a la máquina.
					*/}
					{vencidasSinOrden.map((s) => (
						<div
							key={s.id}
							className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs"
						>
							<p className="font-medium text-foreground">
								{s.due?.reason ?? 'Pauta vencida'}
							</p>
							<p className="mt-1 text-muted-foreground">
								Todavía no tiene orden emitida. Avisá al supervisor para que la cree.
							</p>
						</div>
					))}
				</section>
			)}
		</div>
	);
}
