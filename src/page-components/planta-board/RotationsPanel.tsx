'use client';

/**
 * Rotaciones: armar una vez quién rota con quién, y que las semanas se llenen
 * solas (`shift-rotation.ts`, `POST /api/shift-rotations/generate`).
 *
 * Pensado para que armarlo no sea una carga:
 * - se parte de una plantilla (dos equipos Mañana ⇄ Tarde, dos personas en una
 *   máquina, turno fijo) en vez de una hoja en blanco;
 * - en vez de pedir "semana de referencia" y "posición", se pregunta lo que el
 *   supervisor sabe: ¿quién está en qué turno ESTA semana? El orden sale de ahí;
 * - la tarjeta dice en castellano qué va a pasar esta semana y la próxima.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Pause, Pencil, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ShiftDef } from '@/lib/machine-calendar';
import { addDays, describeWeek, mondayOf, teamShift, type Rotation } from '@/lib/shift-rotation';
import { SHIFT_TONE } from './WeekRosterGrid';

const DAYS = [
	{ d: 1, l: 'L' },
	{ d: 2, l: 'M' },
	{ d: 3, l: 'M' },
	{ d: 4, l: 'J' },
	{ d: 5, l: 'V' },
	{ d: 6, l: 'S' },
	{ d: 0, l: 'D' },
];

/** El rol que se escribe en la asignación, según la máquina: no se le pregunta a nadie. */
const ROLE_BY_TYPE: Record<string, string> = {
	offset_printer: 'Operador de prensa',
	digital_printer: 'Operador de prensa',
	guillotine: 'Guillotina',
	die_cutter: 'Troquelado',
	manual_workshop: 'Terminaciones',
	folder: 'Terminaciones',
	laminator: 'Terminaciones',
	delivery: 'Despacho',
	pre_press: 'Pre-prensa',
};

interface DraftTeam {
	name: string;
	/** Qué turno hace ESTA semana (null = descansa). De acá sale el orden. */
	thisWeek: string | null;
	members: Array<{ employee_id: string; machine_id: string }>;
}

interface Draft {
	id?: string;
	name: string;
	shift_ids: string[];
	weekdays: number[];
	saturday_shift_id: string | null;
	active: boolean;
	teams: DraftTeam[];
}

const todayKey = () => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const firstName = (full?: string) => String(full ?? '').trim().split(/\s+/)[0] || '¿?';

/** Las rotaciones, compartidas por el panel y la grilla de Planta (misma caché). */
export function useShiftRotations() {
	return useQuery<{ available: boolean; rotations: Rotation[] }>({
		queryKey: ['shift-rotations'],
		queryFn: async () => {
			const res = await fetch('/api/shift-rotations', { credentials: 'include' });
			if (!res.ok) throw new Error(`No se pudieron leer las rotaciones (${res.status})`);
			return res.json();
		},
	});
}

export function RotationsPanel({
	workers,
	machines,
	shiftDefinitions,
	canEdit,
}: {
	workers: any[];
	machines: any[];
	shiftDefinitions: ShiftDef[];
	canEdit: boolean;
}) {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<Draft | null>(null);
	const [saving, setSaving] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [lastRun, setLastRun] = useState<any | null>(null);

	const { data, isLoading } = useShiftRotations();
	const rotations = data?.rotations ?? [];
	const available = data?.available !== false;

	const defs = useMemo(() => [...shiftDefinitions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [shiftDefinitions]);
	const defById = useMemo(() => new Map(defs.map((d) => [d.id, d])), [defs]);
	const byCode = (code: string) => defs.find((d) => d.code === code)?.id ?? null;
	const workerName = useMemo(() => new Map(workers.map((w: any) => [w.id, w.full_name ?? w.name])), [workers]);
	const machineById = useMemo(() => new Map(machines.map((m: any) => [m.id, m])), [machines]);
	const shiftName = (id: string | null) => (id ? defById.get(id)?.name ?? '¿?' : 'descansa');

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: ['shift-rotations'] });
		queryClient.invalidateQueries({ queryKey: ['assignments'] });
		queryClient.invalidateQueries({ queryKey: ['planificacion'] });
	};

	// ── Plantillas ─────────────────────────────────────────────────────────────
	const fromTemplate = (kind: 'equipos' | 'personas' | 'fijo'): Draft => {
		const m = byCode('manana');
		const t = byCode('tarde');
		if (kind === 'fijo') {
			const taller = byCode('taller') ?? m;
			return { name: 'Taller', shift_ids: taller ? [taller] : [], weekdays: [1, 2, 3, 4, 5], saturday_shift_id: null, active: true, teams: [{ name: 'Equipo', thisWeek: taller, members: [] }] };
		}
		const shifts = [m, t].filter((x): x is string => !!x);
		return {
			name: kind === 'equipos' ? 'Prensas' : 'Guillotina',
			shift_ids: shifts,
			weekdays: [1, 2, 3, 4, 5],
			// Un solo equipo por máquina el sábado: el que esa semana está de Mañana.
			saturday_shift_id: m,
			active: true,
			teams:
				kind === 'equipos'
					? [
							{ name: 'Equipo A', thisWeek: m, members: [] },
							{ name: 'Equipo B', thisWeek: t, members: [] },
						]
					: [
							{ name: 'Persona 1', thisWeek: m, members: [] },
							{ name: 'Persona 2', thisWeek: t, members: [] },
						],
		};
	};

	const fromRotation = (r: Rotation): Draft => ({
		id: r.id,
		name: r.name,
		shift_ids: r.shift_ids,
		weekdays: r.weekdays,
		saturday_shift_id: r.saturday_shift_id,
		active: r.active,
		teams: [...r.teams]
			.sort((a, b) => a.position - b.position)
			.map((t) => ({ name: t.name, thisWeek: teamShift(r, t.position, todayKey()), members: t.members.map(({ employee_id, machine_id }) => ({ employee_id, machine_id })) })),
	});

	// ── Guardar ────────────────────────────────────────────────────────────────
	/** De "quién está en qué turno esta semana" al orden y la semana de referencia. */
	const toPayload = (d: Draft) => {
		const ordered: DraftTeam[] = [];
		for (const s of d.shift_ids) {
			const team = d.teams.find((t) => t.thisWeek === s && !ordered.includes(t));
			if (team) ordered.push(team);
		}
		for (const t of d.teams) if (!ordered.includes(t)) ordered.push(t);
		return {
			id: d.id,
			name: d.name,
			shift_ids: d.shift_ids,
			weekdays: d.weekdays,
			saturday_shift_id: d.saturday_shift_id,
			anchor_week: mondayOf(todayKey()),
			active: d.active,
			teams: ordered.map((t) => ({
				name: t.name,
				members: t.members
					.filter((m) => m.employee_id && m.machine_id)
					.map((m) => ({ ...m, role: ROLE_BY_TYPE[machineById.get(m.machine_id)?.type] ?? 'Operador' })),
			})),
		};
	};

	const draftProblem = (d: Draft): string | null => {
		const missing = d.shift_ids.filter((s) => !d.teams.some((t) => t.thisWeek === s));
		if (missing.length > 0) return `Esta semana nadie hace ${missing.map(shiftName).join(' y ')}: elige qué equipo.`;
		const dup = d.shift_ids.find((s) => d.teams.filter((t) => t.thisWeek === s).length > 1);
		if (dup) return `Dos equipos están en ${shiftName(dup)} esta semana.`;
		return null;
	};

	const save = async (payload: ReturnType<typeof toPayload>, message: string) => {
		setSaving(true);
		try {
			const res = await fetch('/api/shift-rotations', {
				method: 'PUT',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error(body?.error ?? 'No se pudo guardar');
			toast({ title: message, description: 'Genera las semanas para que se vea en Planta y en el Cronograma.' });
			refresh();
			return true;
		} catch (e) {
			toast({ title: 'No se guardó la rotación', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
			return false;
		} finally {
			setSaving(false);
		}
	};

	/** Desde esta semana, cada equipo pasa al turno siguiente (con dos equipos: se intercambian). */
	const shiftByOneWeek = (r: Rotation) => {
		const d = fromRotation({ ...r, anchor_week: addDays(r.anchor_week, -7) });
		save(toPayload(d), `${r.name}: turnos intercambiados desde esta semana`);
	};

	const remove = async (r: Rotation) => {
		if (!window.confirm(`¿Borrar la rotación «${r.name}»? Se quitan sus turnos de hoy en adelante; lo ya trabajado queda.`)) return;
		const res = await fetch(`/api/shift-rotations?id=${r.id}`, { method: 'DELETE', credentials: 'include' });
		if (!res.ok) toast({ title: 'No se pudo borrar', variant: 'destructive' });
		refresh();
	};

	const generate = async () => {
		setGenerating(true);
		try {
			const res = await fetch('/api/shift-rotations/generate', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weeks: 4 }),
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error(body?.error ?? 'No se pudo generar');
			setLastRun(body);
			toast({
				title: `${body.created} turnos cargados hasta el ${String(body.to).slice(8)}/${String(body.to).slice(5, 7)}`,
				description:
					body.skipped.length + body.rejected.length > 0
						? `${body.skipped.length} respetan un cambio o una licencia, ${body.rejected.length} los rechazó el contrato. Detalle abajo.`
						: 'Sin excepciones.',
			});
			refresh();
		} catch (e) {
			toast({ title: 'No se generaron los turnos', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
		} finally {
			setGenerating(false);
		}
	};

	// ── Vista ──────────────────────────────────────────────────────────────────
	if (!available) {
		return (
			<section className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
				Las rotaciones necesitan la migración <code>20261103120000</code>. Mientras tanto, la semana se carga a mano en la vista Día.
			</section>
		);
	}

	const today = todayKey();
	const nextWeek = addDays(mondayOf(today), 7);

	return (
		<section className="rounded-md border border-border bg-card">
			<header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
				<div>
					<h3 className="text-sm font-semibold">Rotaciones</h3>
					<p className="text-xs text-muted-foreground">Quién rota con quién. Cambian solas cada lunes.</p>
				</div>
				{canEdit && (
					<div className="flex flex-wrap items-center gap-1.5">
						<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraft(fromTemplate('equipos'))}>
							<Plus className="mr-1 h-3 w-3" /> Dos equipos Mañana ⇄ Tarde
						</Button>
						<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraft(fromTemplate('personas'))}>
							<Plus className="mr-1 h-3 w-3" /> Dos personas en una máquina
						</Button>
						<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraft(fromTemplate('fijo'))}>
							<Plus className="mr-1 h-3 w-3" /> Turno fijo
						</Button>
						<Button size="sm" className="h-7 text-xs" onClick={generate} disabled={generating || rotations.every((r) => !r.active)}>
							<RefreshCw className={cn('mr-1 h-3 w-3', generating && 'animate-spin')} /> Generar próximas 4 semanas
						</Button>
					</div>
				)}
			</header>

			{isLoading ? (
				<p className="p-3 text-xs text-muted-foreground">Cargando…</p>
			) : rotations.length === 0 ? (
				<p className="p-3 text-xs text-muted-foreground">
					Todavía no hay rotaciones. Empieza con «Dos equipos Mañana ⇄ Tarde» para las prensas, y «Dos personas en una máquina» para cada guillotina o el troquel.
				</p>
			) : (
				<ul className="divide-y divide-border">
					{rotations.map((r) => {
						const now = describeWeek(r, today);
						const next = describeWeek(r, nextWeek);
						const dayText = DAYS.filter((x) => r.weekdays.includes(x.d)).map((x) => x.l).join('');
						return (
							<li key={r.id} className={cn('px-3 py-2', !r.active && 'opacity-60')}>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="text-sm font-medium">
										{r.name}
										<span className="ml-2 text-xs font-normal text-muted-foreground">
											{r.shift_ids.map(shiftName).join(' ⇄ ')} · {dayText}
											{r.saturday_shift_id ? ` · sábado: el equipo de ${shiftName(r.saturday_shift_id)}` : ''} · cambia los lunes
											{!r.active && ' · en pausa'}
										</span>
									</div>
									{canEdit && (
										<div className="flex items-center gap-1">
											<Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => shiftByOneWeek(r)} disabled={saving} title="Desde esta semana, cada equipo pasa al turno siguiente">
												<ArrowLeftRight className="mr-1 h-3 w-3" /> Intercambiar
											</Button>
											<Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => save({ ...toPayload(fromRotation(r)), active: !r.active }, r.active ? `${r.name} en pausa` : `${r.name} activa`)} title={r.active ? 'Pausar' : 'Activar'}>
												{r.active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
											</Button>
											<Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setDraft(fromRotation(r))} title="Editar">
												<Pencil className="h-3 w-3" />
											</Button>
											<Button size="sm" variant="ghost" className="h-6 px-2 text-red-600" onClick={() => remove(r)} title="Borrar">
												<Trash2 className="h-3 w-3" />
											</Button>
										</div>
									)}
								</div>
								<div className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
									{[
										['Esta semana', now],
										['La próxima', next],
									].map(([label, week]: any) => (
										<div key={label} className="flex flex-wrap items-center gap-1">
											<span className="w-20 text-muted-foreground">{label}</span>
											{week.teams.map(({ team, shiftId, saturday }: any) => (
												<span key={team.id} className={cn('rounded border px-1.5 py-0.5', shiftId ? SHIFT_TONE[defById.get(shiftId)?.code ?? ''] : 'border-dashed border-border text-muted-foreground')}>
													{team.name} → {shiftName(shiftId)}
													{saturday && ' + sáb'}
												</span>
											))}
										</div>
									))}
								</div>
								<div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
									{[...r.teams]
										.sort((a, b) => a.position - b.position)
										.map((t) => (
											<div key={t.id}>
												<b className="text-foreground">{t.name}:</b>{' '}
												{t.members.map((m) => `${firstName(workerName.get(m.employee_id))} (${machineById.get(m.machine_id)?.name ?? '¿?'})`).join(', ') || 'sin personas'}
											</div>
										))}
								</div>
							</li>
						);
					})}
				</ul>
			)}

			{lastRun && (lastRun.skipped.length > 0 || lastRun.rejected.length > 0) && (
				<details className="border-t border-border px-3 py-2 text-xs" open>
					<summary className="cursor-pointer font-medium">
						Última generación: {lastRun.created} turnos · {lastRun.skipped.length} respetados · {lastRun.rejected.length} rechazados
					</summary>
					<ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
						{lastRun.rejected.map((x: any, i: number) => (
							<li key={`r${i}`} className="text-red-600 dark:text-red-400">
								{x.date.slice(8)}/{x.date.slice(5, 7)} {x.employee}: {x.reason}
							</li>
						))}
						{lastRun.skipped.map((x: any, i: number) => (
							<li key={`s${i}`} className="text-muted-foreground">
								{x.date.slice(8)}/{x.date.slice(5, 7)} {x.employee}: {x.reason}, no se tocó
							</li>
						))}
					</ul>
				</details>
			)}

			{draft && (
				<RotationEditor
					draft={draft}
					setDraft={setDraft}
					defs={defs}
					workers={workers}
					machines={machines}
					saving={saving}
					problem={draftProblem(draft)}
					onSave={async () => {
						if (await save(toPayload(draft), `Rotación «${draft.name}» guardada`)) setDraft(null);
					}}
				/>
			)}
		</section>
	);
}

function RotationEditor({
	draft,
	setDraft,
	defs,
	workers,
	machines,
	saving,
	problem,
	onSave,
}: {
	draft: Draft;
	setDraft: (d: Draft | null) => void;
	defs: ShiftDef[];
	workers: any[];
	machines: any[];
	saving: boolean;
	problem: string | null;
	onSave: () => void;
}) {
	const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
	const setTeam = (i: number, patch: Partial<DraftTeam>) => set({ teams: draft.teams.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
	const shiftName = (id: string) => defs.find((d) => d.id === id)?.name ?? '¿?';
	const sortedWorkers = useMemo(() => [...workers].sort((a, b) => String(a.full_name ?? a.name).localeCompare(String(b.full_name ?? b.name))), [workers]);
	const lastMachine = draft.teams.flatMap((t) => t.members).map((m) => m.machine_id).filter(Boolean).pop() ?? '';

	const toggleShift = (id: string) => {
		const has = draft.shift_ids.includes(id);
		const shift_ids = has ? draft.shift_ids.filter((s) => s !== id) : [...draft.shift_ids, id];
		set({
			shift_ids,
			saturday_shift_id: draft.saturday_shift_id && shift_ids.includes(draft.saturday_shift_id) ? draft.saturday_shift_id : null,
			teams: draft.teams.map((t) => (t.thisWeek && !shift_ids.includes(t.thisWeek) ? { ...t, thisWeek: null } : t)),
		});
	};

	return (
		<Dialog open onOpenChange={(open) => !open && setDraft(null)}>
			<DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{draft.id ? 'Editar rotación' : 'Nueva rotación'}</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 text-sm">
					<label className="block">
						<span className="text-xs text-muted-foreground">Nombre</span>
						<Input value={draft.name} onChange={(e) => set({ name: e.target.value })} className="h-8" />
					</label>

					<div>
						<span className="text-xs text-muted-foreground">Turnos que se reparten (en orden) y días</span>
						<div className="mt-1 flex flex-wrap items-center gap-1.5">
							{defs.map((d) => (
								<button
									key={d.id}
									type="button"
									onClick={() => toggleShift(d.id)}
									className={cn('rounded border px-2 py-1 text-xs', draft.shift_ids.includes(d.id) ? SHIFT_TONE[d.code ?? ''] : 'border-border text-muted-foreground')}
								>
									{draft.shift_ids.includes(d.id) && `${draft.shift_ids.indexOf(d.id) + 1}. `}
									{d.name} {d.start_time.slice(0, 2)}–{d.end_time.slice(0, 2)}
								</button>
							))}
							<span className="mx-1 text-muted-foreground">·</span>
							{DAYS.map((x) => (
								<button
									key={x.d}
									type="button"
									onClick={() => set({ weekdays: draft.weekdays.includes(x.d) ? draft.weekdays.filter((w) => w !== x.d) : [...draft.weekdays, x.d] })}
									className={cn('h-7 w-7 rounded border text-xs', draft.weekdays.includes(x.d) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}
								>
									{x.l}
								</button>
							))}
						</div>
					</div>

					{!draft.weekdays.includes(6) && draft.shift_ids.length > 0 && (
						<label className="flex items-center gap-2 text-xs">
							<span className="text-muted-foreground">Sábado:</span>
							<select
								className="h-7 rounded border border-border bg-background px-1"
								value={draft.saturday_shift_id ?? ''}
								onChange={(e) => set({ saturday_shift_id: e.target.value || null })}
							>
								<option value="">no se trabaja</option>
								{draft.shift_ids.map((s) => (
									<option key={s} value={s}>
										lo trabaja el equipo que esa semana está de {shiftName(s)}
									</option>
								))}
							</select>
						</label>
					)}

					<div className="space-y-2">
						<span className="text-xs text-muted-foreground">Equipos — y en qué turno está cada uno ESTA semana</span>
						{draft.teams.map((team, i) => (
							<div key={i} className="rounded border border-border p-2">
								<div className="flex flex-wrap items-center gap-2">
									<Input value={team.name} onChange={(e) => setTeam(i, { name: e.target.value })} className="h-7 w-40 text-xs" />
									<span className="text-xs text-muted-foreground">esta semana:</span>
									<select
										className="h-7 rounded border border-border bg-background px-1 text-xs"
										value={team.thisWeek ?? ''}
										onChange={(e) => setTeam(i, { thisWeek: e.target.value || null })}
									>
										{draft.shift_ids.map((s) => (
											<option key={s} value={s}>
												{shiftName(s)}
											</option>
										))}
										<option value="">descansa</option>
									</select>
									{draft.teams.length > 1 && (
										<button type="button" className="ml-auto text-muted-foreground hover:text-red-600" onClick={() => set({ teams: draft.teams.filter((_, j) => j !== i) })} title="Quitar equipo">
											<X className="h-3.5 w-3.5" />
										</button>
									)}
								</div>
								<div className="mt-1.5 space-y-1">
									{team.members.map((m, k) => (
										<div key={k} className="flex items-center gap-1.5">
											<select
												className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs"
												value={m.employee_id}
												onChange={(e) => {
													const members = team.members.map((x, j) => (j === k ? { ...x, employee_id: e.target.value } : x));
													// Un equipo de una persona se llama como ella: «Roberto ⇄ Felipe» se lee solo.
													const person = workers.find((w: any) => w.id === e.target.value);
													const autoName = /^(Persona \d|Equipo)$/.test(team.name) && team.members.length === 1 && person;
													setTeam(i, { members, ...(autoName ? { name: firstName(person.full_name ?? person.name) } : {}) });
												}}
											>
												<option value="">persona…</option>
												{sortedWorkers.map((w: any) => (
													<option key={w.id} value={w.id}>
														{w.full_name ?? w.name}
														{w.department ? ` — ${w.department}` : ''}
													</option>
												))}
											</select>
											<span className="text-xs text-muted-foreground">→</span>
											<select
												className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs"
												value={m.machine_id}
												onChange={(e) => setTeam(i, { members: team.members.map((x, j) => (j === k ? { ...x, machine_id: e.target.value } : x)) })}
											>
												<option value="">máquina…</option>
												{machines.map((mc: any) => (
													<option key={mc.id} value={mc.id}>
														{mc.name}
													</option>
												))}
											</select>
											<button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => setTeam(i, { members: team.members.filter((_, j) => j !== k) })} title="Quitar">
												<X className="h-3.5 w-3.5" />
											</button>
										</div>
									))}
									<button
										type="button"
										className="text-xs text-primary hover:underline"
										onClick={() => setTeam(i, { members: [...team.members, { employee_id: '', machine_id: team.members.at(-1)?.machine_id ?? lastMachine }] })}
									>
										+ persona
									</button>
								</div>
							</div>
						))}
						<button
							type="button"
							className="text-xs text-primary hover:underline"
							onClick={() => set({ teams: [...draft.teams, { name: `Equipo ${String.fromCharCode(65 + draft.teams.length)}`, thisWeek: null, members: [] }] })}
						>
							+ equipo
						</button>
					</div>

					<p className="text-xs text-muted-foreground">
						Cada lunes, cada equipo pasa al turno siguiente de la lista. Lo que cambies a mano en un día, las licencias y los topes del contrato se
						respetan al generar.
					</p>
					{problem && <p className="text-xs font-medium text-red-600 dark:text-red-400">{problem}</p>}
				</div>

				<DialogFooter>
					<Button variant="outline" size="sm" onClick={() => setDraft(null)}>
						Cancelar
					</Button>
					<Button size="sm" onClick={onSave} disabled={saving || !!problem || !draft.name.trim()}>
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
