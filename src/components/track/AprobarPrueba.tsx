'use client';

/**
 * El botón que le faltaba al enlace público — Fase C de
 * docs/spec-pre-prensa-y-visto-bueno.md, nunca construida hasta esta
 * auditoría (2026-08-31).
 *
 * `/track/[token]` era de sólo lectura: el cliente veía en qué iba su pedido
 * y para aprobar o rechazar la prueba alguien del taller tenía que llamarlo,
 * anotar la respuesta a mano y volver al sistema. Esto cierra ese círculo
 * usando el mismo enlace que el cliente ya tiene, sin pedirle una cuenta.
 *
 * Pide lo mismo que `VistoBuenoDialog` (mismo `src/lib/approval.ts`, misma
 * validación) — la diferencia es quién lo llena: allá lo hace el vendedor
 * declarando qué le confirmó el cliente; acá lo hace el cliente mismo, así
 * que "cómo se confirmó" ya no hace falta preguntarlo (es, por definición,
 * "desde el enlace") y el servidor lo fuerza.
 */

import { useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react';

import {
	PROOFED_ON_LABELS,
	REJECT_REASON_LABELS,
	validateApproval,
	type Decision,
	type ProofedOn,
	type RejectReason,
} from '@/lib/approval';

interface Props {
	token: string;
	otNumber: string;
	onDecided: (mensaje: string) => void;
}

export function AprobarPrueba({ token, otNumber, onDecided }: Props) {
	const [decision, setDecision] = useState<Decision>('approved');
	const [nombre, setNombre] = useState('');
	const [correo, setCorreo] = useState('');
	const [cargo, setCargo] = useState('');
	const [contra, setContra] = useState<ProofedOn>('pdf');
	const [motivo, setMotivo] = useState<RejectReason | null>(null);
	const [comentario, setComentario] = useState('');
	const [enviando, setEnviando] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const entrada = {
		decision,
		confirmedVia: 'portal' as const,
		approverName: nombre || null,
		approverEmail: correo || null,
		approverRole: cargo || null,
		proofedOn: decision === 'approved' ? contra : null,
		rejectReason: decision === 'rejected' ? motivo : null,
		comments: comentario || null,
	};
	// La misma regla que corre en el servidor: si esto no alcanza acá, tampoco
	// va a alcanzar allá. El nombre queda fuera a propósito -- ahí sí es
	// obligatorio pedirlo: es la única identificación que va a quedar.
	const erroresValidacion = validateApproval(entrada).filter(
		(e) => e.field !== 'confirmedVia' && (e.field !== 'approverName' || nombre.length > 0),
	);
	const faltaNombre = nombre.trim().length === 0;
	const puedeEnviar = erroresValidacion.length === 0 && !faltaNombre && (decision === 'approved' || !!motivo);

	const enviar = async () => {
		if (!puedeEnviar) return;
		setEnviando(true);
		setError(null);
		try {
			const res = await fetch(`/api/track/${token}/approval`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(entrada),
			});
			const b = await res.json().catch(() => null);
			if (!res.ok) {
				setError(b?.error ?? 'No se pudo registrar tu respuesta. Probá de nuevo.');
				return;
			}
			onDecided(b.mensaje as string);
		} catch {
			setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.');
		} finally {
			setEnviando(false);
		}
	};

	return (
		<div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-lg backdrop-blur-sm">
			<div className="flex items-center gap-2">
				<ShieldCheck className="h-5 w-5 text-primary" />
				<h2 className="text-lg font-semibold text-foreground">Aprobar la prueba — {otNumber}</h2>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Esto es lo que autoriza a comprar el papel y grabar las planchas. Una vez que aprobás,
				cualquier corrección posterior corre por cuenta del taller sólo si el error fue de
				impresión, no del arte que aprobaste acá.
			</p>

			<div className="mt-4 grid grid-cols-2 gap-2">
				{([
					{ v: 'approved' as const, icono: Check, texto: 'Apruebo', clase: 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
					{ v: 'rejected' as const, icono: X, texto: 'Rechazo', clase: 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400' },
				]).map(({ v, icono: Icono, texto, clase }) => (
					<button
						key={v}
						type="button"
						onClick={() => setDecision(v)}
						className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
							decision === v ? clase : 'border-border text-muted-foreground hover:border-primary/40'
						}`}
					>
						<Icono className="h-4 w-4" />
						{texto}
					</button>
				))}
			</div>

			<div className="mt-4 space-y-3">
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="text-xs font-medium text-muted-foreground" htmlFor="ap-nombre">
							Tu nombre *
						</label>
						<input
							id="ap-nombre"
							value={nombre}
							onChange={(e) => setNombre(e.target.value)}
							placeholder="Nombre y apellido"
							className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						/>
					</div>
					<div>
						<label className="text-xs font-medium text-muted-foreground" htmlFor="ap-cargo">
							Cargo
						</label>
						<input
							id="ap-cargo"
							value={cargo}
							onChange={(e) => setCargo(e.target.value)}
							placeholder="opcional"
							className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						/>
					</div>
				</div>
				<div>
					<label className="text-xs font-medium text-muted-foreground" htmlFor="ap-correo">
						Correo
					</label>
					<input
						id="ap-correo"
						type="email"
						value={correo}
						onChange={(e) => setCorreo(e.target.value)}
						placeholder="opcional"
						className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					/>
				</div>

				{decision === 'approved' ? (
					<div>
						<p className="text-xs font-medium text-muted-foreground">Estás aprobando contra *</p>
						<div className="mt-1.5 flex flex-wrap gap-1.5">
							{(Object.keys(PROOFED_ON_LABELS) as ProofedOn[]).map((v) => (
								<button
									key={v}
									type="button"
									onClick={() => setContra(v)}
									className={`rounded-full border px-3 py-1 text-xs transition-colors ${
										contra === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
									}`}
								>
									{PROOFED_ON_LABELS[v]}
								</button>
							))}
						</div>
						{contra === 'pdf' && (
							<p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
								<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
								Aprobar sobre un PDF no aprueba el color de verdad — si te importa el color exacto,
								pedí una prueba física antes de aprobar.
							</p>
						)}
					</div>
				) : (
					<div>
						<p className="text-xs font-medium text-muted-foreground">¿Qué hay que corregir? *</p>
						<div className="mt-1.5 flex flex-wrap gap-1.5">
							{(Object.keys(REJECT_REASON_LABELS) as RejectReason[]).map((v) => (
								<button
									key={v}
									type="button"
									onClick={() => setMotivo(v)}
									className={`rounded-full border px-3 py-1 text-xs transition-colors ${
										motivo === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
									}`}
								>
									{REJECT_REASON_LABELS[v]}
								</button>
							))}
						</div>
					</div>
				)}

				<div>
					<label className="text-xs font-medium text-muted-foreground" htmlFor="ap-comentario">
						Comentario
					</label>
					<textarea
						id="ap-comentario"
						rows={2}
						value={comentario}
						onChange={(e) => setComentario(e.target.value)}
						placeholder={decision === 'rejected' ? 'Contanos qué corregir' : 'Opcional'}
						className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					/>
				</div>

				{error && (
					<p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
						<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
						{error}
					</p>
				)}

				<button
					type="button"
					onClick={enviar}
					disabled={!puedeEnviar || enviando}
					className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
				>
					{enviando && <Loader2 className="h-4 w-4 animate-spin" />}
					{decision === 'approved' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
				</button>
			</div>
		</div>
	);
}
