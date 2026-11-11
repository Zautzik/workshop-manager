'use client';

/**
 * Por qué etapas pasa la OT.
 *
 * No toda OT pasa por todas las columnas del Tablero, así que se pregunta al
 * crearla en vez de adivinarla después. Viene marcada con lo que sugiere la
 * ficha; lo que se marque acá es lo que manda (`ots.route_steps`).
 *
 * Y dice dónde sale el papel: en la primera etapa marcada, una vez — el pliego
 * que entra a la guillotina es el mismo que sigue a la prensa y al troquel.
 */

import { Package, RotateCcw, Route } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PLAN_STEPS, type PlanStepKey } from '@/lib/production-route';
import { effectiveRoute, paperEntryStep, suggestedRoute } from '@/lib/ot-route-form';
import type { UnifiedOTForm } from '@/types/ot-unified';

interface Props {
	form: UnifiedOTForm;
	updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

export function RouteStepsPicker({ form, updateForm }: Props) {
	const route = effectiveRoute(form);
	const suggested = suggestedRoute(form);
	const entry = paperEntryStep(route);
	const isCustom = form.route_steps != null;

	const toggle = (key: PlanStepKey, on: boolean) => {
		const next = on ? [...route, key] : route.filter((k) => k !== key);
		updateForm({ route_steps: PLAN_STEPS.map((s) => s.key).filter((k) => next.includes(k)) });
	};

	return (
		<Card className="space-y-3 border p-4">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h3 className="flex items-center gap-2 text-sm font-semibold">
						<Route className="h-4 w-4 text-primary" />
						Etapas por las que pasa
					</h3>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{isCustom
							? 'Elegida a mano. El Tablero y el plan siguen esta ruta.'
							: 'Sugerida por la ficha (colores, terminaciones, máquina). Corregila si este trabajo no pasa por alguna.'}
					</p>
				</div>
				{isCustom && (
					<Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => updateForm({ route_steps: null })}>
						<RotateCcw className="mr-1 h-3 w-3" />
						Volver a la sugerida
					</Button>
				)}
			</div>

			<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
				{PLAN_STEPS.map((s) => {
					const on = route.includes(s.key);
					return (
						<label
							key={s.key}
							className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
								on ? 'border-primary/40 bg-primary/5' : 'border-border'
							}`}
						>
							<Checkbox checked={on} onCheckedChange={(v) => toggle(s.key, v === true)} />
							<span className="flex-1">{s.label}</span>
							{s.key === entry && (
								<span className="flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
									<Package className="h-3 w-3" />
									sale el papel
								</span>
							)}
							{!on && suggested.includes(s.key) && <span className="text-[10px] text-muted-foreground">sugerida</span>}
						</label>
					);
				})}
			</div>

			<p className="text-xs leading-relaxed text-muted-foreground">
				{entry
					? `El papel sale de bodega una vez, al entrar a «${PLAN_STEPS.find((s) => s.key === entry)?.label}»: son los mismos pliegos que siguen por el resto de la ruta.`
					: 'Ninguna etapa marcada trabaja el pliego: esta OT no saca papel de bodega.'}
			</p>
		</Card>
	);
}
