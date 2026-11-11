'use client';

/**
 * La salida de papel: de qué lote y cuántos pliegos, al entrar la OT a la
 * primera etapa de su ruta.
 *
 * El pliego que entra a la guillotina es el mismo que sigue a la prensa y al
 * troquel (regla del dueño, 2026-11-11), así que el papel sale de bodega acá,
 * una vez, y no se pregunta en ninguna otra etapa. Lo usan el Tablero y la
 * revisión del parte de WhatsApp: los dos mueven la OT por el mismo camino
 * (moveOT), que exige esto mismo.
 *
 * Viene pre-llenado —el lote reservado para la OT y los pliegos que le tocan a
 * lo que entra— y se corrige con lo que de verdad salió: el lote que se tomó
 * (escaneando su etiqueta o eligiéndolo) y los pliegos contados. La cantidad
 * se pasa sola a la unidad del lote (kg, resmas).
 */

import { useQuery } from '@tanstack/react-query';
import { Package, Plus, ScanLine, ShieldAlert, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { certStatus, CERT_LABELS } from '@/lib/purchasing';
import { decodeLotQR } from '@/lib/traceability';
import type { PaperLot, PaperPlan } from '@/lib/paper-issue-server';
import type { PaperIssuePayload } from '@/lib/paper-issue-schema';

interface Row {
	key: string;
	lotId: string;
	sheets: number;
	overrideReason: string;
}

/** Lo que el bloque le devuelve a quien mueve la OT. */
export interface SalidaDePapelState {
	/** Todavía cargando el plan: no se puede decidir. */
	loading: boolean;
	/** Entrar a esta etapa saca papel y queda papel por sacar. */
	required: boolean;
	/** Las líneas listas para el servidor; `null` si falta algo o algo no puede ser. */
	lines: PaperIssuePayload[] | null;
	/** Por qué `lines` es null, para el aviso. */
	problem: string | null;
}

interface Props {
	otId: string;
	toStatus: string;
	/** Unidades que entran (un avance parcial mueve menos que la OT). */
	movedUnits: number;
	onChange: (s: SalidaDePapelState) => void;
}

const fmt = (n: number, digits = 0) => n.toLocaleString('es-CL', { maximumFractionDigits: digits });
const newKey = () => Math.random().toString(36).slice(2);

function needsOverride(lot: PaperLot | undefined): boolean {
	if (!lot || !lot.certRequired) return false;
	const s = certStatus(lot.certification_expires_on);
	return s === 'vencido' || s === 'sin_certificado';
}

export function SalidaDePapel({ otId, toStatus, movedUnits, onChange }: Props) {
	const { data: plan, isLoading, error } = useQuery({
		queryKey: ['paper-issue-plan', otId, toStatus, movedUnits],
		queryFn: async (): Promise<PaperPlan> => {
			const res = await fetch(
				`/api/ots/${otId}/paper-issue?to=${encodeURIComponent(toStatus)}&units=${encodeURIComponent(String(movedUnits))}`,
			);
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error(body?.error ?? 'No se pudo calcular el papel que sale');
			return body as PaperPlan;
		},
		enabled: Boolean(otId && toStatus && movedUnits > 0),
	});

	const [qr, setQr] = useState('');
	const lotById = useMemo(() => new Map((plan?.lots ?? []).map((l) => [l.id, l])), [plan]);

	// Pre-llenado: el primer lote sugerido (el reservado para la OT, si hay) con
	// los pliegos que le tocan a lo que entra. Las líneas editadas pertenecen al
	// plan del que salieron: si cambian las unidades, cambia el plan y se vuelve
	// a la sugerencia (sin un efecto que pise lo escrito).
	const planKey = plan ? `${plan.ownerOtId}|${plan.entryStatus}|${plan.sheets}|${plan.issuedSheets}` : '';
	const [edited, setEdited] = useState<{ planKey: string; rows: Row[] } | null>(null);
	const suggestedRows = useMemo((): Row[] => {
		if (!plan?.required) return [];
		const first = plan.lots.find((l) => !l.blocked_reason && l.availableSheets != null);
		return [{ key: 'sugerida', lotId: first?.id ?? '', sheets: plan.sheets, overrideReason: '' }];
	}, [plan]);
	const rows = edited && edited.planKey === planKey ? edited.rows : suggestedRows;
	const setRows = (fn: (rs: Row[]) => Row[]) => setEdited({ planKey, rows: fn(rows) });
	const total = rows.reduce((s, r) => s + (Number(r.sheets) || 0), 0);

	const problem = useMemo((): string | null => {
		if (!plan?.required) return null;
		if (rows.length === 0) return 'Falta el lote del que sale el papel.';
		for (const r of rows) {
			const lot = lotById.get(r.lotId);
			if (!lot) return 'Elegí de qué lote sale el papel.';
			if (!(r.sheets > 0)) return `Indicá cuántos pliegos salen del lote ${lot.lot_number}.`;
			if (lot.blocked_reason) return `El lote ${lot.lot_number} está retenido: ${lot.blocked_reason}`;
			if (lot.availableSheets == null) {
				return `El lote ${lot.lot_number} está en ${lot.unit} y su ítem no tiene medidas de pliego: completalo en Bodega.`;
			}
			if (r.sheets > lot.availableSheets) {
				return `El lote ${lot.lot_number} tiene ${fmt(lot.availableSheets)} pliegos y estás sacando ${fmt(r.sheets)}.`;
			}
			if (needsOverride(lot) && !r.overrideReason.trim()) {
				return `El lote ${lot.lot_number}: ${CERT_LABELS[certStatus(lot.certification_expires_on)].toLowerCase()}. Hace falta autorización escrita.`;
			}
		}
		const ids = rows.map((r) => r.lotId);
		if (new Set(ids).size !== ids.length) return 'El mismo lote aparece dos veces: sumá los pliegos en una línea.';
		return null;
	}, [plan, rows, lotById]);

	useEffect(() => {
		onChange({
			loading: isLoading,
			required: Boolean(plan?.required),
			lines:
				plan?.required && !problem
					? rows.map((r) => ({ lot_id: r.lotId, sheets: Math.round(r.sheets), override_reason: r.overrideReason.trim() || null }))
					: null,
			problem: error ? (error as Error).message : problem,
		});
	}, [isLoading, plan, rows, problem, error, onChange]);

	const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

	// Escanear la etiqueta del pallet elige ese lote en la primera línea vacía o
	// en la primera: lo que se escanea es lo que salió, no lo que se sugirió.
	const leido = qr ? decodeLotQR(qr) : null;
	const onScan = (value: string) => {
		const d = value ? decodeLotQR(value) : null;
		if (d?.ok && d.lotId && lotById.has(d.lotId)) {
			const lotId = d.lotId;
			setRows((rs) => {
				if (rs.some((r) => r.lotId === lotId)) return rs;
				const idx = Math.max(0, rs.findIndex((r) => !r.lotId));
				return rs.map((r, i) => (i === idx ? { ...r, lotId } : r));
			});
			setQr('');
			return;
		}
		setQr(value);
	};
	if (isLoading) {
		return <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">Calculando el papel que sale…</div>;
	}
	if (error) {
		return (
			<div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400">
				{(error as Error).message}
			</div>
		);
	}
	if (!plan || plan.entryStatus !== toStatus) return null;

	if (!plan.required) {
		return (
			<div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
				<Package className="mt-0.5 h-4 w-4 shrink-0" />
				<span>{plan.note || 'El papel de este trabajo ya salió de bodega.'}</span>
			</div>
		);
	}

	return (
		<div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
			<div className="flex items-start gap-2">
				<Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">
						Sale el papel de bodega:{' '}
						<span className="tabular-nums text-primary">{fmt(plan.sheets)} pliegos</span>
					</p>
					<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						Al entrar a {plan.entryLabel} el papel deja la bodega: son los mismos pliegos que siguen por el resto de
						la ruta, así que no se vuelve a descontar. {plan.note}
						{plan.ownerOtId !== otId && ` Se carga a la OT ${plan.ownerOtNumber}.`}
					</p>
				</div>
			</div>

			<div>
				<Label htmlFor={`qr-papel-${otId}`} className="flex items-center gap-1.5 text-xs">
					<ScanLine className="h-3 w-3" />
					Etiqueta del pallet que se tomó
				</Label>
				<Input
					id={`qr-papel-${otId}`}
					value={qr}
					onChange={(e) => onScan(e.target.value)}
					placeholder="Escaneá o pegá el código del lote"
					className="h-9 font-mono text-sm"
				/>
				{qr && leido && !leido.ok && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{leido.problem}</p>}
				{leido?.ok && leido.lotId && !lotById.has(leido.lotId) && (
					<p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Ese lote no es papel con saldo disponible.</p>
				)}
			</div>

			<div className="space-y-2">
				{rows.map((r) => {
					const lot = lotById.get(r.lotId);
					const qty = lot?.perSheet ? r.sheets * lot.perSheet : null;
					return (
						<div key={r.key} className="space-y-2 rounded-md border border-border bg-card p-2.5">
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_auto]">
								<div>
									<Label className="text-[11px] text-muted-foreground">Lote</Label>
									<select
										value={r.lotId}
										onChange={(e) => update(r.key, { lotId: e.target.value })}
										className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
									>
										<option value="">Elegí un lote…</option>
										{plan.lots.map((l) => (
											<option key={l.id} value={l.id} disabled={Boolean(l.blocked_reason)}>
												{l.lot_number} — {l.item_name} — {fmt(l.available, 2)} {l.unit}
												{l.availableSheets != null ? ` (${fmt(l.availableSheets)} pl.)` : ''}
												{l.reservedForOT > 0 ? ' · reservado para esta OT' : l.matchesSpec ? ' · mismo papel' : ''}
												{l.blocked_reason ? ' · retenido' : ''}
											</option>
										))}
									</select>
								</div>
								<div>
									<Label className="text-[11px] text-muted-foreground">Pliegos</Label>
									<Input
										type="number"
										min={1}
										value={r.sheets || ''}
										onChange={(e) => update(r.key, { sheets: Math.max(0, Math.round(Number(e.target.value))) })}
										className="h-9 text-sm tabular-nums"
									/>
								</div>
								<div className="flex items-end">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-9 w-9"
										disabled={rows.length <= 1}
										onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
										aria-label="Quitar este lote"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</div>
							{lot && qty != null && lot.perSheet !== 1 && (
								<p className="text-[11px] tabular-nums text-muted-foreground">
									≈ {fmt(qty, 2)} {lot.unit} de este lote
								</p>
							)}
							{needsOverride(lot) && (
								<div className="rounded-md border border-red-500/40 bg-red-500/5 p-2">
									<p className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
										<ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
										{CERT_LABELS[certStatus(lot?.certification_expires_on)]}: no entra a producción sin autorización escrita.
									</p>
									<Textarea
										rows={2}
										value={r.overrideReason}
										onChange={(e) => update(r.key, { overrideReason: e.target.value })}
										placeholder="Quién lo autoriza y por qué. Queda a tu nombre."
										className="mt-1.5 text-xs"
									/>
								</div>
							)}
						</div>
					);
				})}
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 text-xs"
					disabled={rows.length >= 5}
					onClick={() => setRows((rs) => [...rs, { key: newKey(), lotId: '', sheets: 0, overrideReason: '' }])}
				>
					<Plus className="mr-1 h-3 w-3" />
					Otro lote
				</Button>
				<span className={`text-xs tabular-nums ${total !== plan.sheets ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
					{fmt(total)} de {fmt(plan.sheets)} pliegos sugeridos
				</span>
			</div>

			{problem && <p className="text-xs text-red-600 dark:text-red-400">{problem}</p>}
		</div>
	);
}
