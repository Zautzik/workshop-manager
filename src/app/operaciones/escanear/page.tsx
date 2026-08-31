'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ScanLine, ShieldAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { decodeLotQR } from '@/lib/traceability';

/** Dónde se está consumiendo el papel. Son los dos saltos reales. */
const ETAPAS = [
	{ key: 'guillotine_first_cut', label: 'Primer corte' },
	{ key: 'offset_printing', label: 'Offset' },
	{ key: 'digital_printing', label: 'Digital' },
] as const;

/**
 * Escanear el lote al cargarlo en la máquina.
 *
 * Es la pantalla más importante del sistema de trazabilidad y la más simple a
 * propósito: la usa alguien de pie, con guantes, al lado de una máquina
 * andando. Cada campo de más es un registro que no se va a hacer.
 *
 * ── Por qué un campo de texto y no la cámara ────────────────────────────────
 *
 * El campo acepta lo que sea que entregue el lector: una pistola de código de
 * barras escribe como un teclado, y el teléfono pega el texto. Empezar por acá
 * hace que funcione con lo que el taller ya tenga, en vez de exigir permisos de
 * cámara en un galpón sin señal. La cámara se puede sumar después sin cambiar
 * nada de lo que hay abajo.
 *
 * ── Por qué la autorización aparece sola ────────────────────────────────────
 *
 * Cuando el servidor rechaza por certificado, la respuesta trae el motivo y la
 * pantalla abre el campo de autorización en el mismo lugar. La alternativa —
 * mandarlo a buscar a otra pantalla— termina con el operario cargando el papel
 * igual y registrándolo «después».
 */
function EscanearInner() {
	// `?ot=<id>&etapa=<stage>` -- lo usa el aviso que ahora aparece al cerrar
	// una etapa en el tablero (CierreDeEtapa.tsx): sin esto, llegar acá desde
	// ese aviso significaba volver a buscar la misma OT en la lista.
	// Como estado inicial y no como efecto, por la misma razón que ya explica
	// OTManagement.tsx para `?asistente=1`: un efecto reabriría/repisaría la
	// elección cada vez que cambia el parámetro, incluso después de que el
	// operario ya la corrigió a mano.
	const searchParams = useSearchParams();
	const [codigo, setCodigo] = useState('');
	const [otId, setOtId] = useState(() => searchParams?.get('ot') ?? '');
	const [cantidad, setCantidad] = useState('');
	const [etapa, setEtapa] = useState<string>(() => {
		const pedida = searchParams?.get('etapa');
		return pedida && ETAPAS.some((e) => e.key === pedida) ? pedida : 'guillotine_first_cut';
	});
	const [autorizacion, setAutorizacion] = useState('');
	const [pideAutorizacion, setPideAutorizacion] = useState<string | null>(null);
	const [ultimo, setUltimo] = useState<Record<string, unknown> | null>(null);
	const [enviando, setEnviando] = useState(false);
	const campoCodigo = useRef<HTMLInputElement>(null);

	const { data: ots = [] } = useQuery({
		queryKey: ['ots-en-planta'],
		queryFn: async () => {
			const res = await fetch('/api/ots?limit=200');
			if (!res.ok) return [];
			const b = await res.json();
			const filas = (b.data ?? b.ots ?? []) as { id: string; ot_number: string; status: string; client_name?: string }[];
			// Sólo las que pueden estar consumiendo papel ahora. Los nombres salen
			// del enum real: `first_cut` y `printing` no existen, y filtrar por
			// ellos dejaba la lista vacía sin decir por qué.
			return filas.filter((o) =>
				['in_storage', 'guillotine_first_cut', 'offset_printing', 'digital_printing'].includes(o.status),
			);
		},
	});

	const leido = codigo ? decodeLotQR(codigo) : null;

	const enviar = async () => {
		if (!leido?.ok || !otId || !cantidad) return;
		setEnviando(true);
		const res = await fetch('/api/lots/scan', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				qr: codigo,
				ot_id: otId,
				quantity: Number(cantidad),
				stage: etapa,
				override_reason: autorizacion || null,
			}),
		});
		setEnviando(false);
		const b = await res.json().catch(() => null);

		if (!res.ok) {
			if (b?.code === 'NECESITA_AUTORIZACION') {
				// No es un error: es un dato que falta, y se pide donde está la mano.
				setPideAutorizacion(b.error);
				return;
			}
			toast.error(b?.error ?? 'No se pudo registrar');
			return;
		}

		setUltimo(b.consumo);
		toast.success(`${b.consumo.lot_number} → ${b.consumo.ot_number}`);
		// Listo para el siguiente pallet sin tocar nada más.
		setCodigo('');
		setCantidad('');
		setAutorizacion('');
		setPideAutorizacion(null);
		campoCodigo.current?.focus();
	};

	return (
		<div className="mx-auto max-w-xl space-y-4 p-4 md:p-8">
			<div>
				<h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
					<ScanLine className="h-6 w-6 text-primary" />
					Cargar papel a la máquina
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Escaneá la etiqueta del pallet. Queda registrado qué lote entró en qué orden.
				</p>
			</div>

			<Card>
				<CardContent className="space-y-4 pt-5">
					<div>
						<Label htmlFor="qr">Etiqueta del lote</Label>
						{/* Grande y con foco al entrar: la pistola escribe acá sola. */}
						<Input
							id="qr"
							ref={campoCodigo}
							autoFocus
							value={codigo}
							onChange={(e) => setCodigo(e.target.value)}
							placeholder="Escaneá o escribí el código"
							className="h-12 font-mono text-base"
						/>
						{codigo && leido && !leido.ok && (
							<p className="mt-1 text-xs text-red-600 dark:text-red-400">{leido.problem}</p>
						)}
						{leido?.ok && (
							<p className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
								<CheckCircle2 className="h-3 w-3" /> Etiqueta reconocida
							</p>
						)}
					</div>

					<div>
						<Label htmlFor="ot">¿Para qué orden?</Label>
						<select
							id="ot"
							value={otId}
							onChange={(e) => setOtId(e.target.value)}
							className="h-12 w-full rounded-md border border-input bg-background px-3 text-base"
						>
							<option value="">Elegí la OT…</option>
							{ots.map((o) => (
								<option key={o.id} value={o.id}>
									{o.ot_number} — {o.client_name ?? ''}
								</option>
							))}
						</select>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="cant">Cuánto sacás</Label>
							<Input
								id="cant"
								type="number"
								inputMode="numeric"
								value={cantidad}
								onChange={(e) => setCantidad(e.target.value)}
								className="h-12 text-base"
							/>
						</div>
						<div>
							<Label>Dónde</Label>
							<div className="mt-1 flex gap-1">
								{ETAPAS.map((e) => (
									<button
										key={e.key}
										type="button"
										onClick={() => setEtapa(e.key)}
										className={`flex-1 rounded-md border px-2 py-2.5 text-sm transition-colors ${
											etapa === e.key
												? 'border-primary bg-primary/10 font-medium text-primary'
												: 'border-border text-muted-foreground'
										}`}
									>
										{e.label}
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Aparece sólo cuando el servidor lo pide, y en el mismo lugar. */}
					{pideAutorizacion && (
						<div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3">
							<p className="flex items-start gap-1.5 text-sm font-medium text-red-700 dark:text-red-400">
								<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
								{pideAutorizacion}
							</p>
							<Label htmlFor="autz" className="mt-2 block text-xs">
								Quién lo autoriza y por qué
							</Label>
							<Textarea
								id="autz"
								rows={2}
								value={autorizacion}
								onChange={(e) => setAutorizacion(e.target.value)}
								placeholder="Queda en el expediente de la orden, con tu nombre y la hora."
							/>
						</div>
					)}

					<Button
						className="h-12 w-full text-base"
						disabled={enviando || !leido?.ok || !otId || !cantidad || (!!pideAutorizacion && !autorizacion.trim())}
						onClick={enviar}
					>
						{enviando ? 'Registrando…' : pideAutorizacion ? 'Registrar con autorización' : 'Registrar'}
					</Button>
				</CardContent>
			</Card>

			{/* La confirmación se queda a la vista: es lo que le dice al operario
			    que puede seguir, y cuánto le queda a ese pallet. */}
			{ultimo && (
				<Card className="border-emerald-500/40 bg-emerald-500/5">
					<CardContent className="py-3 text-sm">
						<p className="font-medium text-emerald-800 dark:text-emerald-300">
							{String(ultimo.quantity)} de {String(ultimo.lot_number)} → OT {String(ultimo.ot_number)}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{String(ultimo.material)} · quedan {Number(ultimo.remaining).toLocaleString('es-CL')} en ese lote
							{ultimo.override ? ' · registrado con desviación autorizada' : ''}
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

export default function EscanearPage() {
	return (
		<ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor', 'technician']}>
			<EscanearInner />
		</ProtectedRoute>
	);
}
