'use client';

import { useState } from 'react';
import { AlertTriangle, Check, ShieldCheck, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import {
	BOUNCES_TO,
	CONFIRMED_VIA_LABELS,
	PROOFED_ON_LABELS,
	RECOVERABLE_VIA,
	REJECT_REASON_LABELS,
	validateApproval,
	type ConfirmedVia,
	type Decision,
	type ProofedOn,
	type RejectReason,
} from '@/lib/approval';

interface Props {
	otId: string | null;
	otNumber?: string;
	clientName?: string | null;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onDone?: (decision: Decision) => void;
}

/**
 * Marcar el visto bueno del cliente.
 *
 * Lo marca el VENDEDOR, no el cliente: él es el eslabón con el cliente y el
 * responsable de que lo que quede registrado sea exacto. Por eso el diálogo
 * empieza diciéndole que queda registrado a su nombre — una responsabilidad que
 * no se ve en el momento de decidir no se siente.
 *
 * Pide poco y bien elegido: cómo se lo confirmaron (lo único recuperable
 * después), contra qué se aprobó, y —si fue que no— por qué. El nombre del
 * contacto es opcional a propósito: obligarlo empuja a escribir relleno, y
 * «Cliente» fue exactamente el relleno que dejó sin valor todo el registro
 * anterior.
 */
export function VistoBuenoDialog({ otId, otNumber, clientName, open, onOpenChange, onDone }: Props) {
	const { user } = useAuth();
	const [decision, setDecision] = useState<Decision>('approved');
	const [via, setVia] = useState<ConfirmedVia | null>(null);
	const [nombre, setNombre] = useState('');
	const [correo, setCorreo] = useState('');
	const [cargo, setCargo] = useState('');
	const [contra, setContra] = useState<ProofedOn>('pdf');
	const [motivo, setMotivo] = useState<RejectReason | null>(null);
	const [comentario, setComentario] = useState('');
	const [guardando, setGuardando] = useState(false);

	const entrada = {
		decision,
		confirmedVia: via,
		approverName: nombre || null,
		approverEmail: correo || null,
		approverRole: cargo || null,
		proofedOn: decision === 'approved' ? contra : null,
		rejectReason: decision === 'rejected' ? motivo : null,
		comments: comentario || null,
	};
	// La misma función que corre en el servidor. Una sola definición de «válido»,
	// así el formulario no promete algo que la ruta después rechaza.
	const errores = validateApproval(entrada);
	const errorDe = (campo: string) => errores.find((e) => e.field === campo)?.message;

	const limpiar = () => {
		setDecision('approved'); setNombre(''); setCorreo(''); setCargo('');
		setContra('pdf'); setMotivo(null); setComentario(''); setVia(null);
	};

	const guardar = async () => {
		if (!otId || errores.length > 0) return;
		setGuardando(true);
		const res = await fetch(`/api/ots/${otId}/approvals`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(entrada),
		});
		setGuardando(false);

		if (!res.ok) {
			const b = await res.json().catch(() => null);
			toast.error(b?.error ?? 'No se pudo registrar la decisión');
			return;
		}

		const b = await res.json();
		toast.success(b.resumen);

		// Aprobar SIGNIFICA que el trabajo sigue. Dejar la OT parada en Visto
		// Bueno después de registrar el sí obligaba a ir al Kanban a arrastrar la
		// tarjeta, que es pedirle al vendedor que sepa por dónde continúa el flujo.
		//
		// Un rechazo no se mueve solo: retroceder es una operación con permisos
		// propios y hay que decidir qué se corrige antes. Lo que sí se dice es a
		// dónde vuelve el trabajo, que ya viene en el resumen.
		if (decision === 'approved') {
			const av = await fetch(`/api/ots/${otId}/transition`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ to_status: 'paper_purchase', reason: 'visto_bueno_aprobado' }),
			});
			if (av.ok) {
				toast.success('Pasa a Compra de Papel.');
			} else {
				// El caso real: el precio firme se alejó de lo cotizado y hace falta
				// reconfirmarlo. No es un error del registro —la aprobación quedó
				// guardada— así que se avisa sin sonar a que se perdió algo.
				const eb = await av.json().catch(() => null);
				toast.warning(
					eb?.error ?? eb?.message ?? 'La aprobación quedó registrada, pero la OT no avanzó sola.',
				);
			}
		}

		limpiar();
		onOpenChange(false);
		onDone?.(decision);
	};

	return (
		<Dialog open={open} onOpenChange={(v) => { if (!v) limpiar(); onOpenChange(v); }}>
			<DialogContent className="max-w-lg gap-3 p-5">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheck className="h-5 w-5 text-primary" />
						Visto bueno de prueba {otNumber && <span className="font-mono text-sm">{otNumber}</span>}
					</DialogTitle>
					<DialogDescription>
						{clientName ? `${clientName} · ` : ''}
						Lo que se registre acá es lo que sostiene el trabajo si después hay un reclamo.
					</DialogDescription>
				</DialogHeader>

				{/* Quién responde, dicho antes de que decida y no en la letra chica.
				    El cliente no entra al sistema: esto no es su firma, es la
				    declaración de una persona identificada del taller. */}
				<div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
					<UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
					<p className="text-muted-foreground">
						Queda registrado a nombre de{' '}
						<span className="font-medium text-foreground">{user?.name || user?.email || 'vos'}</span>,
						con la hora del servidor. Sos el enlace con el cliente y el responsable de que
						esto sea exacto.
					</p>
				</div>

				{/* Sí o no, grande, primero: es la decisión, no un detalle del formulario. */}
				<div className="grid grid-cols-2 gap-2">
					{([
						{ v: 'approved' as const, icono: Check, texto: 'Aprueba', clase: 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
						{ v: 'rejected' as const, icono: X, texto: 'Rechaza', clase: 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400' },
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

				<div className="space-y-3">
					{/* Primero el medio: es el único dato que después se puede ir a
					    buscar, y el que convierte «me dijeron que sí» en algo que se
					    puede mostrar. */}
					<div>
						<Label>Cómo lo confirmó el cliente *</Label>
						<div className="mt-1 flex flex-wrap gap-1.5">
							{(Object.keys(CONFIRMED_VIA_LABELS) as ConfirmedVia[])
								.filter((v) => v !== 'portal')
								.map((v) => (
									<button
										key={v}
										type="button"
										onClick={() => setVia(v)}
										className={`rounded-full border px-3 py-1 text-xs transition-colors ${
											via === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
										}`}
									>
										{CONFIRMED_VIA_LABELS[v]}
									</button>
								))}
						</div>
						{via && !RECOVERABLE_VIA.includes(via) && (
							<p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
								<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
								De esto no queda rastro fuera de tu palabra. Si el trabajo es grande,
								conviene pedirle al cliente un «ok» por correo antes de seguir.
							</p>
						)}
					</div>

					<div>
						<Label htmlFor="vb-nombre">Quién lo confirmó, del lado del cliente</Label>
						<Input
							id="vb-nombre"
							value={nombre}
							onChange={(e) => setNombre(e.target.value)}
							placeholder="Nombre y apellido, si lo sabés"
							className={nombre && errorDe('approverName') ? 'border-red-500' : ''}
						/>
						{nombre.length > 0 && errorDe('approverName') && (
							<p className="mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
								<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
								{errorDe('approverName')}
							</p>
						)}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="vb-correo">Correo</Label>
							<Input id="vb-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="opcional" />
							{errorDe('approverEmail') && (
								<p className="mt-1 text-xs text-red-600 dark:text-red-400">{errorDe('approverEmail')}</p>
							)}
						</div>
						<div>
							{/* En envase de alimento el que firma casi nunca es el que compra:
							    es alguien de regulatorio o de marca. Saber el cargo es lo que
							    después permite pedirle la firma a la persona correcta. */}
							<Label htmlFor="vb-cargo">Cargo</Label>
							<Input id="vb-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="marca, regulatorio…" />
						</div>
					</div>

					{decision === 'approved' ? (
						<div>
							<Label>Contra qué aprobó *</Label>
							<div className="mt-1 flex flex-wrap gap-1.5">
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
								<p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
									Aprobar en pantalla no aprueba el color. Si después se discute el color, esto
									es lo que va a decidir de quién es el costo.
								</p>
							)}
						</div>
					) : (
						<div>
							<Label>Por qué rechaza *</Label>
							<div className="mt-1 flex flex-wrap gap-1.5">
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
							{/* El motivo no es estadística: decide a qué área vuelve el trabajo. */}
							{motivo && (
								<p className="mt-1.5 text-xs text-muted-foreground">
									Vuelve a <span className="font-medium text-foreground">{BOUNCES_TO[motivo]}</span>.
								</p>
							)}
						</div>
					)}

					<div>
						<Label htmlFor="vb-comentario">Comentario</Label>
						<Textarea
							id="vb-comentario"
							rows={2}
							value={comentario}
							onChange={(e) => setComentario(e.target.value)}
							placeholder={decision === 'rejected' ? 'Qué hay que corregir' : 'Opcional'}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
					<Button onClick={guardar} disabled={guardando || errores.length > 0}>
						{guardando ? 'Guardando…' : decision === 'approved' ? 'Registrar aprobación' : 'Registrar rechazo'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
