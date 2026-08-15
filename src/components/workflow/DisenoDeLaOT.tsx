'use client';

import { FileUp, Loader2, Ban } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface Props {
	otId: string;
	onChanged?: () => void;
}

/**
 * Subir el diseño sin salir de Pre-Prensa.
 *
 * Antes este pendiente enlazaba a `/operaciones/ot/[id]`, una página que no
 * existe. Quien abría una OT nueva quedaba varado en el 404 con el trabajo a
 * medio completar: el peor lugar posible para dejar a alguien, porque es
 * exactamente el paso donde la orden se destraba.
 *
 * Se resuelve donde aparece. Un pendiente que manda a otra pantalla es un
 * pendiente que alguien va a resolver «después».
 */
export function DisenoDeLaOT({ otId, onChanged }: Props) {
	const [subiendo, setSubiendo] = useState(false);
	const input = useRef<HTMLInputElement>(null);

	const subir = async (file: File) => {
		setSubiendo(true);
		const fd = new FormData();
		fd.append('file', file);
		fd.append('ot_id', otId);
		const res = await fetch('/api/attachments/upload', {
			method: 'POST',
			credentials: 'include',
			body: fd,
		});
		setSubiendo(false);

		if (!res.ok) {
			const b = await res.json().catch(() => null);
			toast.error(b?.error ?? 'No se pudo subir el diseño');
			return;
		}
		toast.success(`${file.name} quedó adjunto a la orden`);
		onChanged?.();
	};

	const declararSinDiseno = async () => {
		setSubiendo(true);
		const res = await fetch(`/api/ots/${otId}/diseno`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sinDiseno: true }),
		});
		setSubiendo(false);
		if (!res.ok) {
			toast.error('No se pudo guardar');
			return;
		}
		toast.success('Anotado: este trabajo no lleva diseño');
		onChanged?.();
	};

	return (
		<div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
			<input
				ref={input}
				type="file"
				className="hidden"
				accept=".pdf,.ai,.eps,.psd,.tif,.tiff,.jpg,.jpeg,.png"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) subir(f);
					e.target.value = '';
				}}
			/>
			<Button size="sm" className="h-7 text-xs" disabled={subiendo} onClick={() => input.current?.click()}>
				{subiendo ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <FileUp className="mr-1 h-3 w-3" />}
				Subir el diseño
			</Button>
			{/* La otra respuesta válida. Sin este botón, un trabajo que legítimamente
			    no lleva diseño se queda trabado para siempre. */}
			<Button
				variant="ghost"
				size="sm"
				className="h-7 text-xs text-muted-foreground"
				disabled={subiendo}
				onClick={declararSinDiseno}
			>
				<Ban className="mr-1 h-3 w-3" />
				Este trabajo no lleva diseño
			</Button>
		</div>
	);
}
