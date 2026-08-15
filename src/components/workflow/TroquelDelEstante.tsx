'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Hammer, MapPin, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { NEW_DIE_COST_CLP, NEW_DIE_LEAD_DAYS, type Die } from '@/lib/dies';
import { formatCLP } from '@/lib/format';

interface Props {
	otId: string;
	widthCm?: number | null;
	heightCm?: number | null;
	productType?: string | null;
	clientId?: string | null;
	onChanged?: () => void;
}

type Sugerido = Die & { razones: string[] };

/**
 * «¿Tenemos un troquel que sirva?», contestado en la pantalla.
 *
 * Es la pregunta que antes costaba caminar hasta la estantería y revisar a ojo.
 * Un dato que cuesta una caminata no se consulta, así que en la práctica se
 * mandaba a hacer uno nuevo: $320.000 y dos semanas, cada vez.
 *
 * La respuesta va ARRIBA de la alternativa cara, no al lado. Si mandar a hacer
 * uno nuevo es tan fácil de apretar como reutilizar, se sigue comprando de
 * nuevo — la pantalla tiene que tener una opinión.
 */
export function TroquelDelEstante({ otId, widthCm, heightCm, productType, clientId, onChanged }: Props) {
	const [guardando, setGuardando] = useState<string | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ['troqueles', widthCm, heightCm, clientId],
		enabled: !!widthCm && !!heightCm,
		queryFn: async () => {
			const q = new URLSearchParams({ width: String(widthCm), height: String(heightCm) });
			if (productType) q.set('productType', productType);
			if (clientId) q.set('clientId', clientId);
			const res = await fetch(`/api/dies?${q}`);
			if (!res.ok) return { sugeridos: [] as Sugerido[], revisados: 0 };
			return res.json() as Promise<{ sugeridos: Sugerido[]; revisados: number }>;
		},
	});

	const elegir = async (dieId: string | null, etiqueta: string) => {
		setGuardando(dieId ?? 'nuevo');
		const res = await fetch(`/api/ots/${otId}/die`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dieId }),
		});
		setGuardando(null);
		if (!res.ok) {
			toast.error('No se pudo guardar el troquel');
			return;
		}
		toast.success(etiqueta);
		onChanged?.();
	};

	if (!widthCm || !heightCm) {
		return (
			<p className="text-xs text-muted-foreground">
				Sin las medidas de la pieza no se puede buscar en el estante.
			</p>
		);
	}

	const sugeridos = data?.sugeridos ?? [];

	return (
		<div className="space-y-2">
			{isLoading ? (
				<p className="text-xs text-muted-foreground">Buscando en el estante…</p>
			) : sugeridos.length > 0 ? (
				<>
					{/* El ahorro dicho en las dos monedas que importan. Los pesos se
					    discuten; dos semanas de atraso no se discuten con nadie. */}
					<p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
						Hay {sugeridos.length === 1 ? 'uno' : sugeridos.length} en el estante que{' '}
						{sugeridos.length === 1 ? 'sirve' : 'sirven'} — usarlo ahorra{' '}
						{formatCLP(NEW_DIE_COST_CLP)} y {NEW_DIE_LEAD_DAYS} días.
					</p>

					<ul className="space-y-1.5">
						{sugeridos.map((d) => (
							<li
								key={d.id}
								className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-2"
							>
								<span className="font-mono text-sm font-semibold text-foreground">{d.code}</span>
								<span className="text-xs text-muted-foreground">{d.name}</span>

								{/* Dónde está, físicamente: sin esto el registro no ahorra
								    la caminata, sólo la disfraza. */}
								{d.shelfLocation && (
									<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
										<MapPin className="h-3 w-3" />
										{d.shelfLocation}
									</span>
								)}

								<span className="text-xs tabular-nums text-muted-foreground">
									{d.timesUsed} {d.timesUsed === 1 ? 'uso' : 'usos'}
								</span>

								{d.status === 'desgastado' && (
									<span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
										<TriangleAlert className="h-3 w-3" />
										desgastado
									</span>
								)}

								<Button
									size="sm"
									className="ml-auto h-7 text-xs"
									disabled={guardando !== null}
									onClick={() => elegir(d.id, `Se usa el ${d.code}, está en ${d.shelfLocation ?? 'el estante'}`)}
								>
									<Check className="mr-1 h-3 w-3" />
									Usar este
								</Button>
							</li>
						))}
					</ul>
				</>
			) : (
				<p className="text-xs text-muted-foreground">
					Ninguno de los {data?.revisados ?? 0} del estante calza con {widthCm}×{heightCm}.
				</p>
			)}

			{/* La alternativa cara existe, pero abajo y en gris: es la que hay que
			    poder elegir, no la que la pantalla propone. */}
			<Button
				variant="ghost"
				size="sm"
				className="h-7 text-xs text-muted-foreground"
				disabled={guardando !== null}
				onClick={() => elegir(null, 'Anotado: se manda a hacer un troquel nuevo')}
			>
				<Hammer className="mr-1 h-3 w-3" />
				Mandar a hacer uno nuevo ({formatCLP(NEW_DIE_COST_CLP)}, {NEW_DIE_LEAD_DAYS} días)
			</Button>
		</div>
	);
}
