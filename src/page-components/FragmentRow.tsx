'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Star, MapPin, Pencil, Wallet } from 'lucide-react';
import { CONTRACT_LABEL, formatMoney, type MergedPerson, type TodayAssignment } from './personas-shared';
import { ScoreBar } from './ScoreBar';
import { EditableFicha } from './EditableFicha';

export function FragmentRow({ person: p, expanded, contractType, hrsWeek, assignment, presentNow, onToggle, onSaved }: {
  person: MergedPerson;
  expanded: boolean;
  contractType?: string;
  hrsWeek?: number;
  assignment: TodayAssignment | null;
  presentNow: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const hasComp = p.comp?.hourly_rate != null;
  return (
    <>
      <tr
        className={`border-b border-border cursor-pointer transition-colors hover:bg-muted/30 ${expanded ? 'bg-muted/30' : ''}`}
        onClick={onToggle}
      >
        <td className="py-3 pl-4 pr-2 text-muted-foreground">
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </td>
        <td className="py-3 px-2">
          <div className="flex items-center gap-1.5">
            {/* Live from the station kiosk — green means clocked in right now. */}
            <span
              title={presentNow ? 'Presente ahora (marcó entrada)' : 'Sin marca de entrada activa'}
              aria-label={presentNow ? 'Presente ahora' : 'Ausente'}
              className={`h-2 w-2 shrink-0 rounded-full ${
                presentNow ? 'bg-emerald-500' : 'bg-muted-foreground/25'
              }`}
            />
            <span className="font-semibold text-foreground text-[15px]">{p.full_name}</span>
          </div>
          {p.employee_code && <div className="text-xs text-muted-foreground font-mono pl-3.5">{p.employee_code}</div>}
        </td>
        <td className="py-3 px-2 text-muted-foreground">{p.department || '—'}</td>
        <td className="py-3 px-2">
          {contractType ? (
            <div>
              <div className="text-foreground">{CONTRACT_LABEL[contractType] || contractType}</div>
              {hrsWeek != null && <div className="text-xs text-muted-foreground">{hrsWeek} h/sem</div>}
            </div>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-500/40">Sin contrato</Badge>
          )}
        </td>
        <td className="py-3 px-2 text-right tabular-nums">
          {hasComp ? (
            <span className="font-medium text-foreground">{formatMoney(Number(p.comp.hourly_rate))}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-3 px-2 text-right">
          {p.rating > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums font-medium text-foreground">
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />{p.rating}
            </span>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="py-3 px-2">
          {p.top ? (
            <span className="text-foreground">
              {p.top.name} <span className="text-muted-foreground">· N{p.top.level}</span>
            </span>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="py-3 px-2" onClick={e => e.stopPropagation()}>
          {assignment ? (
            <Link
              href="/operaciones/planta"
              className="group/asg inline-flex flex-col gap-0.5 hover:underline"
            >
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {assignment.station || 'Estación'}
                {assignment.extra > 0 && (
                  <span className="text-xs text-muted-foreground">+{assignment.extra}</span>
                )}
              </span>
              {assignment.otNumber && (
                <span className="text-xs text-muted-foreground pl-5">OT {assignment.otNumber}</span>
              )}
            </Link>
          ) : (
            <span className="text-muted-foreground">Sin asignar</span>
          )}
        </td>
        <td className="py-3 px-2 pr-4">
          <Badge
            variant="outline"
            className={p.status === 'active'
              ? 'text-emerald-600 border-emerald-500/40 bg-emerald-500/5'
              : 'text-muted-foreground border-border'}
          >
            {p.status === 'active' ? 'Activo' : p.status}
          </Badge>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td></td>
          <td colSpan={8} className="py-4 pr-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Column 1: the editable ficha */}
              <EditableFicha person={p} onSaved={onSaved} />

              {/* Column 2: performance breakdown */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rendimiento</div>
                <ScoreBar label="Calidad" value={p.quality} />
                <ScoreBar label="Velocidad" value={p.speed} />
                <ScoreBar label="Asistencia" value={p.attendance} />
                <ScoreBar label="Trabajo en equipo" value={p.teamwork} />
              </div>

              {/* Column 3: skills + actions */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competencias</div>
                {p.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {p.skills.map((s: any, i: number) => (
                      <Badge key={i} variant="outline" className="border-border font-normal">
                        {s?.skill?.name || s?.skill?.code}
                        <span className="ml-1 text-muted-foreground">N{s?.proficiency_level ?? '?'}</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Sin competencias registradas</div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href="/personas/empleados" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Pencil className="h-3 w-3" /> Editar ficha
                  </Link>
                  <Link href="/personas/nomina" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Wallet className="h-3 w-3" /> Ver nómina
                  </Link>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
