'use client';

import { useQuery } from '@tanstack/react-query';
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	FileText,
	Loader2,
	PackageCheck,
	ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCLP } from '@/lib/format';
import {
	CERT_LABELS,
	certPermiteRecibir,
	certStatus,
	TOLERANCIA_RECEPCION,
} from '@/lib/purchasing';

interface Props {
	ot: { id: string; ot_number: string; client_name?: string | null } | null;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onDone?: () => void;
}

interface OC {
	id: string;
	oc_number: string | null;
	status: string;
	supplier: string | null;
	total_cost: number | null;
}

/**
 * Compra de Papel → En Bodega.
 *
 * Acá el Kanban pedía «registro de costos reales», que es la pregunta
 * equivocada. Lo que ocurre en este paso no es estimar un gasto: **se emite un
 * documento y se recibe otro**, y los dos tienen valor legal y de
 * certificación.
 *
 * ── Por qué la factura no está acá ──────────────────────────────────────────
 *
 * Porque el papel llega antes que la factura, siempre. Exigir el documento para
 * dejar avanzar la OT pararía la planta esperando administración. La OT avanza
 * con la OC emitida y el material recibido; la factura se registra después,
 * desde Compras, y ahí se concilia contra lo que efectivamente llegó.
 *
 * ── Lo que sí se exige ──────────────────────────────────────────────────────
 *
 * El número de lote y el certificado, porque son el eslabón de trazabilidad: de
 * un pliego consumido hay que poder llegar al lote, del lote a la OC, y de la
 * OC al proveedor y su certificado. Si eso no se captura al recibir, no se
 * captura nunca — y es lo que una auditoría FSSC pide reconstruir en horas.
 */
export function CompraDePapelDialog({ ot, open, onOpenChange, onDone }: Props) {
	const [paso, setPaso] = useState<'oc' | 'recepcion'>('oc');
	const [trabajando, setTrabajando] = useState(false);

	// Recepción
	const [itemId, setItemId] = useState('');
	const [cantidad, setCantidad] = useState('');
	const [costoUnitario, setCostoUnitario] = useState('');
	const [lote, setLote] = useState('');
	const [cert, setCert] = useState('');
	const [certVence, setCertVence] = useState('');
	const [motivoDesvio, setMotivoDesvio] = useState('');
	const [autorizacionCert, setAutorizacionCert] = useState('');

	const { data: ocs = [], refetch: refetchOC } = useQuery({
		queryKey: ['oc-de-ot', ot?.id],
		enabled: !!ot?.id && open,
		queryFn: async () => {
			const res = await fetch(`/api/purchases?ot_id=${ot!.id}`);
			if (!res.ok) return [] as OC[];
			const b = await res.json();
			const filas: OC[] = b.data ?? b.purchases ?? b ?? [];
			return filas.filter((o) => o.status !== 'cancelled');
		},
	});

	const { data: materiales = [] } = useQuery({
		queryKey: ['materiales-papel'],
		enabled: open,
		queryFn: async () => {
			const res = await fetch('/api/inventory/items?limit=200');
			if (!res.ok) return [];
			const b = await res.json();
			return (b.data ?? b.items ?? []) as { id: string; name: string; unit?: string }[];
		},
	});

	const oc = ocs[0] ?? null;
	const emitida = oc && oc.status !== 'draft';

	const estadoCert = certStatus(certVence || null);
	const certBloquea = certVence !== '' && !certPermiteRecibir(estadoCert);

	const emitir = async () => {
		if (!oc) return;
		setTrabajando(true);
		const res = await fetch(`/api/purchases/${oc.id}/issue`, { method: 'POST' });
		setTrabajando(false);
		const b = await res.json().catch(() => null);
		if (!res.ok) {
			toast.error(b?.error ?? 'No se pudo emitir la OC');
			return;
		}
		toast.success(b.mensaje);
		await refetchOC();
		setPaso('recepcion');
	};

	const recibir = async () => {
		if (!oc || !itemId || !cantidad) return;
		setTrabajando(true);
		const res = await fetch(`/api/purchases/${oc.id}/receive`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				item_id: itemId,
				quantity: Number(cantidad),
				unit_cost: costoUnitario ? Number(costoUnitario) : null,
				lot_number: lote || null,
				cert_code: cert || null,
				cert_expires: certVence || null,
				variance_reason: motivoDesvio || null,
				cert_override_reason: autorizacionCert || null,
			}),
		});
		setTrabajando(false);
		const b = await res.json().catch(() => null);

		if (!res.ok) {
			// El servidor pide el motivo del desvío cuando la diferencia contra lo
			// pedido supera la tolerancia. No es un error: es el dato que falta.
			if (b?.code === 'VARIANZA_SIN_MOTIVO') {
				toast.warning(b.error);
				return;
			}
			toast.error(b?.error ?? 'No se pudo registrar la recepción');
			return;
		}

		toast.success(
			b?.ot?.advanced_to
				? `Recibido. ${ot?.ot_number} pasó a En Bodega.`
				: 'Recepción registrada.',
		);
		onOpenChange(false);
		onDone?.();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl gap-3 p-5">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<PackageCheck className="h-5 w-5 text-primary" />
						Compra de papel · {ot?.ot_number}
					</DialogTitle>
					<DialogDescription>
						{ot?.client_name ? `${ot.client_name} · ` : ''}
						La orden de compra y la recepción son documentos: quedan con número, autor y hora.
					</DialogDescription>
				</DialogHeader>

				{/* Los dos pasos a la vista, para que se entienda dónde está parado. */}
				<ol className="flex items-center gap-2 text-xs">
					{[
						{ k: 'oc' as const, n: 1, t: 'Orden de compra' },
						{ k: 'recepcion' as const, n: 2, t: 'Recepción en bodega' },
					].map((s, i) => (
						<li key={s.k} className="flex items-center gap-2">
							{i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
							<span
								className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
									paso === s.k
										? 'bg-primary/10 font-medium text-primary'
										: 'text-muted-foreground'
								}`}
							>
								<span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px]">
									{s.n}
								</span>
								{s.t}
							</span>
						</li>
					))}
				</ol>

				{!oc ? (
					<div className="rounded-lg border border-dashed border-border py-8 text-center">
						<FileText className="mx-auto h-6 w-6 text-muted-foreground" />
						<p className="mt-2 text-sm text-muted-foreground">
							Esta OT todavía no tiene una orden de compra.
						</p>
						<Button asChild variant="outline" size="sm" className="mt-3">
							<a href="/operaciones/compras">Crearla en Compras</a>
						</Button>
					</div>
				) : paso === 'oc' ? (
					<div className="space-y-3">
						<div className="rounded-lg border border-border bg-card p-3">
							<div className="flex flex-wrap items-baseline gap-x-3">
								<span className="font-mono font-semibold">
									{oc.oc_number ?? 'Sin número'}
								</span>
								<span className="text-sm text-muted-foreground">{oc.supplier}</span>
								<span className="ml-auto font-semibold tabular-nums">
									{formatCLP(Number(oc.total_cost ?? 0))}
								</span>
							</div>
							{!emitida && (
								// Un borrador no tiene número justamente para no quemar un
								// correlativo: los huecos en la numeración son la primera
								// pregunta de una auditoría.
								<p className="mt-2 text-xs text-muted-foreground">
									Todavía es un borrador. Al emitirla toma el número correlativo, queda firmada
									con tu nombre y no se puede volver a editar — se anula o se emite otra.
								</p>
							)}
						</div>

						{emitida ? (
							<div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
								<CheckCircle2 className="h-4 w-4" />
								Emitida. Continuá con la recepción.
							</div>
						) : null}

						<div className="flex justify-end gap-2">
							{emitida ? (
								<Button onClick={() => setPaso('recepcion')}>
									Registrar la recepción <ArrowRight className="ml-1 h-4 w-4" />
								</Button>
							) : (
								<Button onClick={emitir} disabled={trabajando}>
									{trabajando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
									Emitir la orden de compra
								</Button>
							)}
						</div>
					</div>
				) : (
					<div className="space-y-3">
						<div className="grid grid-cols-2 gap-3">
							<div className="col-span-2">
								<Label htmlFor="mat">Material recibido *</Label>
								<select
									id="mat"
									value={itemId}
									onChange={(e) => setItemId(e.target.value)}
									className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
								>
									<option value="">Elegí el material…</option>
									{materiales.map((m) => (
										<option key={m.id} value={m.id}>
											{m.name}
										</option>
									))}
								</select>
							</div>

							<div>
								<Label htmlFor="cant">Cantidad que llegó *</Label>
								<Input
									id="cant"
									type="number"
									value={cantidad}
									onChange={(e) => setCantidad(e.target.value)}
									placeholder="lo que entró, no lo que se pidió"
								/>
							</div>
							<div>
								<Label htmlFor="costo">Costo unitario</Label>
								<Input
									id="costo"
									type="number"
									value={costoUnitario}
									onChange={(e) => setCostoUnitario(e.target.value)}
								/>
							</div>

							{/* El eslabón de trazabilidad. Si no se captura acá, no se
							    captura nunca — y es lo que una auditoría pide reconstruir. */}
							<div>
								<Label htmlFor="lote">Número de lote del proveedor</Label>
								<Input
									id="lote"
									value={lote}
									onChange={(e) => setLote(e.target.value)}
									placeholder="se genera uno si no viene"
								/>
							</div>
							<div>
								<Label htmlFor="cert">Certificado</Label>
								<Input id="cert" value={cert} onChange={(e) => setCert(e.target.value)} />
							</div>

							<div>
								<Label htmlFor="vence">Vence el</Label>
								<Input
									id="vence"
									type="date"
									value={certVence}
									onChange={(e) => setCertVence(e.target.value)}
								/>
								{certVence && (
									<p
										className={`mt-1 text-xs ${
											certBloquea
												? 'text-red-600 dark:text-red-400'
												: estadoCert === 'por_vencer'
													? 'text-amber-700 dark:text-amber-400'
													: 'text-emerald-700 dark:text-emerald-400'
										}`}
									>
										{CERT_LABELS[estadoCert]}
									</p>
								)}
							</div>
						</div>

						{/* Recibir con certificado vencido es una desviación: se puede
						    autorizar, pero con nombre y motivo. Esa es la diferencia
						    entre un control y un cartel. */}
						{certBloquea && (
							<div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3">
								<p className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
									<ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
									Este material no puede entrar a producción con el certificado vencido.
								</p>
								<Label htmlFor="autz" className="mt-2 block text-xs">
									Si igual lo vas a recibir, escribí quién lo autoriza y por qué
								</Label>
								<Textarea
									id="autz"
									rows={2}
									value={autorizacionCert}
									onChange={(e) => setAutorizacionCert(e.target.value)}
									placeholder="Queda registrado a tu nombre en el expediente del lote."
								/>
							</div>
						)}

						<div>
							<Label htmlFor="desvio" className="text-xs">
								Si llegó distinto de lo pedido, por qué
							</Label>
							<Input
								id="desvio"
								value={motivoDesvio}
								onChange={(e) => setMotivoDesvio(e.target.value)}
								placeholder={`Se pide sobre ${Math.round(TOLERANCIA_RECEPCION * 100)}% de diferencia`}
							/>
						</div>

						<div className="flex items-center justify-between gap-2">
							<Button variant="ghost" size="sm" onClick={() => setPaso('oc')}>
								Volver
							</Button>
							<div className="flex items-center gap-2">
								{certBloquea && !autorizacionCert.trim() && (
									<span className="flex items-center gap-1 text-xs text-muted-foreground">
										<AlertTriangle className="h-3 w-3" />
										Falta la autorización
									</span>
								)}
								<Button
									onClick={recibir}
									disabled={
										trabajando ||
										!itemId ||
										!cantidad ||
										(certBloquea && !autorizacionCert.trim())
									}
								>
									{trabajando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
									Recibir y pasar a En Bodega
								</Button>
							</div>
						</div>

						<p className="text-[11px] leading-relaxed text-muted-foreground">
							La factura se registra después, desde Compras: el papel llega antes que el
							documento y la OT no puede esperar a administración.
						</p>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
