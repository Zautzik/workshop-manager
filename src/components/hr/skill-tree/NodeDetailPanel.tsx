'use client';

import { useState } from 'react';
import { ChevronRight, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  BRANCHES, CONNECTIONS, SKILL_NODES, TIER_LABELS,
  type SkillNodeDef, type NodeState,
} from '@/lib/craft-skill-paths';
import { ICON_MAP } from './constants';

// ── Detail panel (right-side slide when a node is clicked) ───────────

export function NodeDetailPanel({
  node,
  state,
  proficiency,
  employeeId,
  employeeName,
  onClose,
  onAssign,
}: {
  node: SkillNodeDef;
  state: NodeState;
  proficiency: number;
  employeeId: string | null;
  employeeName: string;
  onClose: () => void;
  onAssign: (level: number) => void;
}) {
  const branchInfo = BRANCHES[node.branch];
  const [level, setLevel] = useState(proficiency || 1);

  const prereqs = CONNECTIONS.filter(c => c.to === node.id);
  const dependants = CONNECTIONS.filter(c => c.from === node.id);

  const stateLabels: Record<NodeState, string> = {
    locked: 'Locked — prerequisites not met',
    available: 'Available — ready to learn',
    in_progress: `In progress — Level ${proficiency}/5`,
    mastered: 'Mastered — Level 5/5',
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[340px] bg-[#0f1219]/95 border-l border-[#1e293b] backdrop-blur-lg z-20 overflow-y-auto">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 44,
                height: 44,
                backgroundColor: branchInfo.darkColor,
                border: `2px solid ${branchInfo.color}`,
              }}
            >
              {(() => {
                const IC = ICON_MAP[node.icon] || CircleDot;
                return <IC style={{ width: 22, height: 22, color: branchInfo.color }} />;
              })()}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{node.name}</h3>
              <p className="text-[10px] font-mono text-slate-500">{node.code}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">&times;</button>
        </div>

        {/* Status */}
        <div
          className="text-xs px-2.5 py-1 rounded-full inline-block font-medium"
          style={{
            backgroundColor: state === 'locked' ? '#1e293b' : branchInfo.darkColor,
            color: state === 'locked' ? '#64748b' : branchInfo.glowColor,
          }}
        >
          {stateLabels[state]}
        </div>

        {/* Description */}
        <p className="text-xs text-slate-400 leading-relaxed">{node.description}</p>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block mb-0.5">Branch</span>
            <span className="text-slate-300 font-medium" style={{ color: branchInfo.color }}>
              {branchInfo.name}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Tier</span>
            <span className="text-slate-300 font-medium">{TIER_LABELS[node.tier]}</span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Categoría</span>
            <span className="text-slate-300 font-medium">{node.category}</span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Competencia</span>
            <div className="flex items-center gap-1 mt-0.5">
              {[1, 2, 3, 4, 5].map(l => (
                <div
                  key={l}
                  className="rounded-full"
                  style={{
                    width: 10,
                    height: 10,
                    backgroundColor: proficiency >= l ? branchInfo.color : '#1e293b',
                    border: `1px solid ${proficiency >= l ? branchInfo.glowColor : '#334155'}`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Prerequisites */}
        {prereqs.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1.5">
              Prerequisites ({prereqs.length})
            </span>
            <div className="space-y-1">
              {prereqs.map(c => {
                const prereqNode = SKILL_NODES.find(n => n.id === c.from);
                if (!prereqNode) return null;
                return (
                  <div key={c.from} className="flex items-center gap-2 text-xs text-slate-400 bg-[#0d1117] rounded px-2 py-1.5 border border-[#1e293b]">
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    {prereqNode.name}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unlocks */}
        {dependants.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1.5">
              Unlocks ({dependants.length})
            </span>
            <div className="space-y-1">
              {dependants.map(c => {
                const depNode = SKILL_NODES.find(n => n.id === c.to);
                if (!depNode) return null;
                const depBranch = BRANCHES[depNode.branch];
                return (
                  <div key={c.to} className="flex items-center gap-2 text-xs text-slate-400 bg-[#0d1117] rounded px-2 py-1.5 border border-[#1e293b]">
                    <ChevronRight className="w-3 h-3" style={{ color: depBranch.color }} />
                    {depNode.name}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Employee skill assignment */}
        {employeeId && state !== 'locked' && (
          <div className="pt-2 border-t border-[#1e293b]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-2">
              {proficiency > 0 ? 'Update Proficiency' : 'Assign Skill'} — {employeeName}
            </span>
            <div className="flex items-center gap-2 mb-3">
              <Label className="text-xs text-slate-400 w-16">Level:</Label>
              <select
                value={level}
                onChange={e => setLevel(Number(e.target.value))}
                className="flex-1 text-xs rounded bg-[#0d1117] border border-[#1e293b] text-slate-300 px-2 py-1.5"
              >
                {[1, 2, 3, 4, 5].map(l => (
                  <option key={l} value={l}>
                    {l} — {['', 'Beginner', 'Intermediate', 'Proficient', 'Advanced', 'Expert'][l]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              className="w-full text-xs"
              style={{ backgroundColor: branchInfo.color }}
              onClick={() => onAssign(level)}
            >
              {proficiency > 0 ? 'Update Level' : 'Assign Skill'}
            </Button>
          </div>
        )}

        {state === 'locked' && employeeId && (
          <div className="pt-2 border-t border-[#1e293b]">
            <p className="text-xs text-slate-500 italic">
              Complete all prerequisites before this skill can be assigned.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
