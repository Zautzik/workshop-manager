import { TIER_LABELS, BRANCHES, type SkillNodeDef } from '@/lib/craft-skill-paths';

export function TalentDevelopmentGuide({
  selectedEmployeeName,
  tierProgress,
  masteredCount,
  inProgressCount,
  availableCount,
  nextUnlockNodes,
  recommendedTracks,
  roleTemplateSummaries,
  selectedTemplateId,
}: {
  selectedEmployeeName: string | null;
  tierProgress: Array<{ tier: number; label: string; completed: number; total: number }>;
  masteredCount: number;
  inProgressCount: number;
  availableCount: number;
  nextUnlockNodes: SkillNodeDef[];
  recommendedTracks: Array<{ id: string; name: string; description: string; percentage: number; completed: number; total: number }>;
  roleTemplateSummaries: Array<{ id: string; name: string; description: string; readiness: number; missingNames: string[] }>;
  selectedTemplateId: string | null;
}) {
  const highestTierWithProgress = tierProgress
    .filter(t => t.completed > 0)
    .map(t => t.tier)
    .sort((a, b) => b - a)[0] ?? 0;

  const masteryRatio = masteredCount + inProgressCount > 0
    ? Math.round((masteredCount / Math.max(1, masteredCount + inProgressCount)) * 100)
    : 0;

  return (
    <div className="px-4 py-3 border-b border-[#1e293b] bg-[#0b1018]">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Estados de aprendizaje</p>
          <div className="space-y-1.5 text-xs">
            <p className="text-slate-300"><span className="text-slate-500">Bloqueada:</span> faltan requisitos previos.</p>
            <p className="text-slate-300"><span className="text-blue-300">Disponible:</span> se puede empezar ya.</p>
            <p className="text-slate-300"><span className="text-amber-300">En curso:</span> asignada y en desarrollo.</p>
            <p className="text-slate-300"><span className="text-emerald-300">Dominada:</span> nivel 5, puede enseñar a otros.</p>
          </div>
        </div>

        <div className="rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Nivel de dominio</p>
          {selectedEmployeeName ? (
            <>
              <p className="text-xs text-slate-300 mb-2">
                {selectedEmployeeName} está hoy en la etapa <span className="text-slate-100 font-semibold">{TIER_LABELS[highestTierWithProgress]}</span>.
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded border border-[#1e293b] p-2 bg-[#0a0f15]">
                  <p className="text-slate-500">Dominadas</p>
                  <p className="text-emerald-300 font-semibold">{masteredCount}</p>
                </div>
                <div className="rounded border border-[#1e293b] p-2 bg-[#0a0f15]">
                  <p className="text-slate-500">En curso</p>
                  <p className="text-amber-300 font-semibold">{inProgressCount}</p>
                </div>
                <div className="rounded border border-[#1e293b] p-2 bg-[#0a0f15]">
                  <p className="text-slate-500">Disponibles</p>
                  <p className="text-blue-300 font-semibold">{availableCount}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">Dominio: {masteryRatio}% de las competencias activas están dominadas.</p>
            </>
          ) : (
            <p className="text-xs text-slate-400">Elige a una persona para ver su avance.</p>
          )}
        </div>

        <div className="rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Próximos objetivos a desbloquear</p>
          {selectedEmployeeName ? (
            nextUnlockNodes.length > 0 ? (
              <div className="space-y-1.5">
                {nextUnlockNodes.map(node => (
                  <div key={node.id} className="rounded border border-[#1e293b] bg-[#0a0f15] px-2 py-1.5">
                    <p className="text-xs text-slate-200 font-medium">{node.name}</p>
                    <p className="text-[11px] text-slate-500">{TIER_LABELS[node.tier]} - {BRANCHES[node.branch].name}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-300">Todas las competencias disponibles ya están en curso o dominadas.</p>
            )
          ) : (
            <p className="text-xs text-slate-400">Elige a una persona para ver qué le conviene aprender después.</p>
          )}
        </div>
      </div>

      {selectedEmployeeName && (
        <div className="mt-3 rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Avance por etapa</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {tierProgress.map(item => {
              const pct = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
              return (
                <div key={item.tier} className="rounded border border-[#1e293b] bg-[#0a0f15] p-2">
                  <p className="text-[11px] text-slate-500">{item.label}</p>
                  <p className="text-sm text-slate-100 font-semibold">{item.completed}/{item.total}</p>
                  <div className="mt-1 h-1.5 rounded bg-[#1f2937] overflow-hidden">
                    <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedEmployeeName && recommendedTracks.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Rutas de desarrollo recomendadas</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {recommendedTracks.map(track => (
              <div key={track.id} className="rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
                <p className="text-xs text-slate-100 font-semibold">{track.name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{track.description}</p>
                <p className="text-[11px] text-slate-400 mt-2">{track.completed}/{track.total} hitos cumplidos</p>
                <div className="mt-1.5 h-1.5 rounded bg-[#1f2937] overflow-hidden">
                  <div className="h-full bg-violet-500" style={{ width: `${track.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedEmployeeName && roleTemplateSummaries.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Roles objetivo</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {roleTemplateSummaries.map(template => (
              <div
                key={template.id}
                className={`rounded border p-2.5 ${selectedTemplateId === template.id ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-[#1e293b] bg-[#0a0f15]'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-100 font-semibold">{template.name}</p>
                  <span className="text-[11px] text-cyan-300">{template.readiness}% listo</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{template.description}</p>
                {template.missingNames.length > 0 ? (
                  <p className="text-[11px] text-amber-300 mt-1.5">
                    Faltan: {template.missingNames.slice(0, 3).join(', ')}{template.missingNames.length > 3 ? '...' : ''}
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-300 mt-1.5">Todos los hitos principales cubiertos.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
