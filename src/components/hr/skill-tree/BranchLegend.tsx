import { BRANCHES, getBranchProgress, type ProficiencyMap } from '@/lib/craft-skill-paths';
import { ORDERED_BRANCHES } from './constants';

// ── Legend & progress bar ────────────────────────────────────────────

export function BranchLegend({
  proficiencyMap,
  hasEmployee,
}: {
  proficiencyMap: ProficiencyMap;
  hasEmployee: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3 px-4 py-2.5 bg-[#0d1117]/80 border-t border-[#1e293b]">
      {ORDERED_BRANCHES.map(key => {
        const b = BRANCHES[key];
        const progress = hasEmployee ? getBranchProgress(key, proficiencyMap) : null;
        return (
          <div key={key} className="flex items-center gap-1.5 text-[11px]">
            <div
              className="rounded-full"
              style={{
                width: 10,
                height: 10,
                backgroundColor: b.color,
                boxShadow: `0 0 6px ${b.glowColor}40`,
              }}
            />
            <span className="text-slate-400">{b.name}</span>
            {progress && (
              <span className="text-slate-600 ml-0.5">
                {progress.completed}/{progress.total}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
