/**
 * @fileoverview Craft Skill Tree — visual, game-inspired skill-tree for the HR Manager.
 *
 * Dark background, colour-coded branches, glowing nodes, lock indicators, SVG
 * curved paths between prerequisite/dependant nodes, employee progress overlay,
 * and click-to-manage interactions.
 */
'use client';

import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  // Icons used inside nodes
  Shield, Wrench, Ruler, Eye, Printer, FileInput, Droplets,
  CircleDot, Layers, Palette, Settings, Crown, FileText, Monitor,
  Maximize2, Database, Sparkles, Scissors, FileMinus, LayoutGrid,
  Target, Cpu, Box, Play, Hexagon, Unlink, Crosshair, Grid3x3,
  Hammer, Search, Package, CornerDownRight, RotateCw, Puzzle, Ribbon,
  // UI icons
  Lock, Award, ZoomIn, ZoomOut, User, ChevronRight, Check,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useEmployees } from '@/hooks/use-employees';
import { supabase } from '@/integrations/supabase/client';
import {
  SKILL_NODES,
  CONNECTIONS,
  BRANCHES,
  SKILL_TRACKS,
  ROLE_TARGET_TEMPLATES,
  TIER_LABELS,
  VIEWBOX,
  getNodeState,
  getBranchProgress,
  getTrackProgress,
  getRoleTemplateReadiness,
  type CraftBranch,
  type SkillNodeDef,
  type ProficiencyMap,
  type NodeState,
} from '@/lib/craft-skill-paths';

// ── Icon map ─────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  'shield': Shield,
  'wrench': Wrench,
  'ruler': Ruler,
  'eye': Eye,
  'printer': Printer,
  'file-input': FileInput,
  'droplets': Droplets,
  'circle-dot': CircleDot,
  'layers': Layers,
  'palette': Palette,
  'settings': Settings,
  'crown': Crown,
  'file-text': FileText,
  'monitor': Monitor,
  'maximize': Maximize2,
  'database': Database,
  'sparkles': Sparkles,
  'scissors': Scissors,
  'file-minus': FileMinus,
  'layout-grid': LayoutGrid,
  'target': Target,
  'cpu': Cpu,
  'box': Box,
  'play': Play,
  'hexagon': Hexagon,
  'unlink': Unlink,
  'crosshair': Crosshair,
  'grid-3x3': Grid3x3,
  'hammer': Hammer,
  'search': Search,
  'package': Package,
  'corner-down-right': CornerDownRight,
  'rotate-cw': RotateCw,
  'puzzle': Puzzle,
  'ribbon': Ribbon,
};

// ── Constants ────────────────────────────────────────────────────────

const NODE_R = 26;
const MASTER_R = 32;
const PROF_DOT_R = 3;

const ORDERED_BRANCHES: CraftBranch[] = [
  'foundation', 'offset_printing', 'digital_printing',
  'guillotine', 'die_cutting', 'workshop',
];

// ── SVG filter definitions (glow per branch) ─────────────────────────

function SvgDefs() {
  return (
    <defs>
      {Object.values(BRANCHES).map(b => (
        <filter
          key={b.id}
          id={`glow-${b.id}`}
          x="-60%"
          y="-60%"
          width="220%"
          height="220%"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feFlood floodColor={b.glowColor} floodOpacity="0.55" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      ))}
      {/* Subtle particle / star background */}
      <radialGradient id="bg-vignette" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor="#141428" />
        <stop offset="100%" stopColor="#0a0a14" />
      </radialGradient>
    </defs>
  );
}

// ── Curved path between two nodes ────────────────────────────────────

function ConnectionPath({
  fromNode,
  toNode,
  branch,
  state,
}: {
  fromNode: SkillNodeDef;
  toNode: SkillNodeDef;
  branch: CraftBranch;
  state: 'active' | 'inactive';
}) {
  const branchInfo = BRANCHES[branch];
  const r1 = fromNode.tier === 5 ? MASTER_R : NODE_R;
  const r2 = toNode.tier === 5 ? MASTER_R : NODE_R;

  const x1 = fromNode.x;
  const y1 = fromNode.y - r1;
  const x2 = toNode.x;
  const y2 = toNode.y + r2;
  const midY = (y1 + y2) / 2;

  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  const color = state === 'active' ? branchInfo.color : '#1e293b';
  const opacity = state === 'active' ? 0.7 : 0.25;
  const width = state === 'active' ? 2.5 : 1.5;

  return (
    <>
      {/* Glow pass */}
      {state === 'active' && (
        <path
          d={d}
          fill="none"
          stroke={branchInfo.glowColor}
          strokeWidth={width + 3}
          strokeLinecap="round"
          opacity={0.15}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={opacity}
      />
    </>
  );
}

// ── Single Skill Node ────────────────────────────────────────────────

function SkillNodeCircle({
  node,
  state,
  proficiency,
  isSelected,
  templateHighlight,
  templateMissing,
  onClick,
}: {
  node: SkillNodeDef;
  state: NodeState;
  proficiency: number;
  isSelected: boolean;
  templateHighlight?: boolean;
  templateMissing?: boolean;
  onClick: () => void;
}) {
  const branchInfo = BRANCHES[node.branch];
  const isMaster = node.tier === 5;
  const r = isMaster ? MASTER_R : NODE_R;
  const IconComp = ICON_MAP[node.icon] || CircleDot;

  // Visual state
  let bgFill: string;
  let borderColor: string;
  let borderWidth: number;
  let filterAttr: string | undefined;
  let iconColor: string;
  let opacity = 1;

  switch (state) {
    case 'mastered':
      bgFill = branchInfo.color;
      borderColor = branchInfo.glowColor;
      borderWidth = 3;
      filterAttr = `url(#glow-${node.branch})`;
      iconColor = '#ffffff';
      break;
    case 'in_progress':
      bgFill = branchInfo.darkColor;
      borderColor = branchInfo.color;
      borderWidth = 2.5;
      filterAttr = `url(#glow-${node.branch})`;
      iconColor = branchInfo.glowColor;
      break;
    case 'available':
      bgFill = '#1a1a2e';
      borderColor = branchInfo.color;
      borderWidth = 2;
      filterAttr = undefined;
      iconColor = branchInfo.color;
      break;
    case 'locked':
    default:
      bgFill = '#111118';
      borderColor = '#2a2a3a';
      borderWidth = 1.5;
      filterAttr = undefined;
      iconColor = '#4a4a5a';
      opacity = 0.55;
      break;
  }

  if (isSelected) {
    borderColor = '#ffffff';
    borderWidth = 3;
  }

  if (templateHighlight && !isSelected) {
    borderColor = '#22d3ee';
    borderWidth = 2.5;
  }

  if (templateMissing) {
    borderColor = '#f59e0b';
    borderWidth = Math.max(borderWidth, 3);
  }

  return (
    <g
      style={{ cursor: 'pointer', opacity }}
      onClick={onClick}
    >
      {/* Background circle */}
      <circle
        cx={node.x}
        cy={node.y}
        r={r}
        fill={bgFill}
        stroke={borderColor}
        strokeWidth={borderWidth}
        filter={filterAttr}
      />

      {/* Icon via foreignObject */}
      <foreignObject
        x={node.x - (isMaster ? 14 : 11)}
        y={node.y - (isMaster ? 14 : 11)}
        width={isMaster ? 28 : 22}
        height={isMaster ? 28 : 22}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <IconComp
            style={{ width: isMaster ? 20 : 16, height: isMaster ? 20 : 16, color: iconColor }}
          />
        </div>
      </foreignObject>

      {/* Lock badge for locked nodes */}
      {state === 'locked' && (
        <foreignObject
          x={node.x + r - 10}
          y={node.y - r - 2}
          width={16}
          height={16}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock style={{ width: 11, height: 11, color: '#6b7280' }} />
          </div>
        </foreignObject>
      )}

      {/* Mastered checkmark badge */}
      {state === 'mastered' && (
        <foreignObject
          x={node.x + r - 10}
          y={node.y - r - 2}
          width={16}
          height={16}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: branchInfo.color,
            }}
          >
            <Check style={{ width: 10, height: 10, color: '#ffffff' }} />
          </div>
        </foreignObject>
      )}

      {/* Proficiency dots (5) below the node */}
      {[1, 2, 3, 4, 5].map((lvl, i) => (
        <circle
          key={i}
          cx={node.x - 12 + i * 6}
          cy={node.y + r + 10}
          r={PROF_DOT_R}
          fill={proficiency >= lvl ? branchInfo.color : '#1e293b'}
          stroke={proficiency >= lvl ? branchInfo.glowColor : '#334155'}
          strokeWidth={0.5}
        />
      ))}

      {/* Node name label */}
      <text
        x={node.x}
        y={node.y + r + 24}
        textAnchor="middle"
        fill={state === 'locked' ? '#4a4a5a' : '#94a3b8'}
        fontSize={9}
        fontFamily="system-ui, sans-serif"
      >
        {node.name.length > 22 ? node.name.slice(0, 20) + '…' : node.name}
      </text>
    </g>
  );
}

// ── Tier label bar (left side) ───────────────────────────────────────

function TierLabels() {
  const tierYPositions: [number, number][] = [
    [0, 1020],
    [1, 860],
    [2, 700],
    [3, 540],
    [4, 380],
    [5, 200],
  ];

  return (
    <>
      {tierYPositions.map(([tier, y]) => (
        <g key={tier}>
          {/* Horizontal guide line */}
          <line
            x1={0}
            y1={y}
            x2={VIEWBOX.width}
            y2={y}
            stroke="#1e293b"
            strokeWidth={0.5}
            strokeDasharray="6 4"
            opacity={0.4}
          />
          {/* Label */}
          <text
            x={14}
            y={y - 8}
            fill="#475569"
            fontSize={10}
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
          >
            {TIER_LABELS[tier]}
          </text>
        </g>
      ))}
    </>
  );
}

// ── Branch trunk lines (thick coloured lines from root) ──────────────

function BranchTrunks() {
  // Thick trunk lines from foundation to craft intro nodes
  const trunks: { from: [number, number]; to: [number, number]; branch: CraftBranch }[] = [
    // Offset (via press intro)
    { from: [480, 1020], to: [250, 860], branch: 'offset_printing' },
    { from: [770, 1020], to: [250, 860], branch: 'offset_printing' },
    // Offset sub-trunk up
    { from: [250, 860], to: [140, 200], branch: 'offset_printing' },
    // Digital sub-trunk up
    { from: [250, 860], to: [365, 200], branch: 'digital_printing' },
    // Guillotine
    { from: [480, 1020], to: [590, 860], branch: 'guillotine' },
    { from: [770, 1020], to: [590, 860], branch: 'guillotine' },
    { from: [590, 860], to: [590, 200], branch: 'guillotine' },
    // Die Cutting
    { from: [480, 1020], to: [870, 860], branch: 'die_cutting' },
    { from: [630, 1020], to: [870, 860], branch: 'die_cutting' },
    { from: [870, 860], to: [870, 200], branch: 'die_cutting' },
    // Workshop
    { from: [480, 1020], to: [1150, 860], branch: 'workshop' },
    { from: [630, 1020], to: [1150, 860], branch: 'workshop' },
    { from: [920, 1020], to: [1150, 860], branch: 'workshop' },
    { from: [1150, 860], to: [1150, 200], branch: 'workshop' },
  ];

  return (
    <>
      {trunks.map((t, i) => {
        const [x1, y1] = t.from;
        const [x2, y2] = t.to;
        const midY = (y1 + y2) / 2;
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
        const branchInfo = BRANCHES[t.branch];
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={branchInfo.color}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.08}
          />
        );
      })}
    </>
  );
}

// ── Detail panel (right-side slide when a node is clicked) ───────────

function NodeDetailPanel({
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

// ── Legend & progress bar ────────────────────────────────────────────

function BranchLegend({
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

function TalentDevelopmentGuide({
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
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Learning States</p>
          <div className="space-y-1.5 text-xs">
            <p className="text-slate-300"><span className="text-slate-500">Locked:</span> prerequisites still pending.</p>
            <p className="text-slate-300"><span className="text-blue-300">Available:</span> ready to start now.</p>
            <p className="text-slate-300"><span className="text-amber-300">In Progress:</span> assigned and currently developing.</p>
            <p className="text-slate-300"><span className="text-emerald-300">Mastered:</span> level 5 and can mentor others.</p>
          </div>
        </div>

        <div className="rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Mastery Snapshot</p>
          {selectedEmployeeName ? (
            <>
              <p className="text-xs text-slate-300 mb-2">
                {selectedEmployeeName} is currently operating at <span className="text-slate-100 font-semibold">{TIER_LABELS[highestTierWithProgress]}</span> stage.
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded border border-[#1e293b] p-2 bg-[#0a0f15]">
                  <p className="text-slate-500">Mastered</p>
                  <p className="text-emerald-300 font-semibold">{masteredCount}</p>
                </div>
                <div className="rounded border border-[#1e293b] p-2 bg-[#0a0f15]">
                  <p className="text-slate-500">In Progress</p>
                  <p className="text-amber-300 font-semibold">{inProgressCount}</p>
                </div>
                <div className="rounded border border-[#1e293b] p-2 bg-[#0a0f15]">
                  <p className="text-slate-500">Available</p>
                  <p className="text-blue-300 font-semibold">{availableCount}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">Mastery quality: {masteryRatio}% of active skills are fully mastered.</p>
            </>
          ) : (
            <p className="text-xs text-slate-400">Select an employee to view personalized mastery progression.</p>
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
              <p className="text-xs text-emerald-300">All currently available unlocks have been started or mastered.</p>
            )
          ) : (
            <p className="text-xs text-slate-400">Choose an employee to surface the next recommended unlocks.</p>
          )}
        </div>
      </div>

      {selectedEmployeeName && (
        <div className="mt-3 rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Progressive Tier Roadmap</p>
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
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Recommended Development Paths</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {recommendedTracks.map(track => (
              <div key={track.id} className="rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
                <p className="text-xs text-slate-100 font-semibold">{track.name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{track.description}</p>
                <p className="text-[11px] text-slate-400 mt-2">{track.completed}/{track.total} milestones completed</p>
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
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Role Target Templates</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {roleTemplateSummaries.map(template => (
              <div
                key={template.id}
                className={`rounded border p-2.5 ${selectedTemplateId === template.id ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-[#1e293b] bg-[#0a0f15]'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-100 font-semibold">{template.name}</p>
                  <span className="text-[11px] text-cyan-300">{template.readiness}% ready</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{template.description}</p>
                {template.missingNames.length > 0 ? (
                  <p className="text-[11px] text-amber-300 mt-1.5">
                    Missing milestones: {template.missingNames.slice(0, 3).join(', ')}{template.missingNames.length > 3 ? '...' : ''}
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

function IndividualDevelopmentPlanPanel({
  employeeName,
  templateName,
  readiness,
  goals30,
  goals60,
  goals90,
  managerNotes,
  signoffManager,
  signoffDate,
  onManagerNotesChange,
  onSignoffManagerChange,
  onSignoffDateChange,
  onCopy,
  onDownload,
}: {
  employeeName: string;
  templateName: string;
  readiness: number;
  goals30: string[];
  goals60: string[];
  goals90: string[];
  managerNotes: string;
  signoffManager: string;
  signoffDate: string;
  onManagerNotesChange: (value: string) => void;
  onSignoffManagerChange: (value: string) => void;
  onSignoffDateChange: (value: string) => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="mx-4 mt-3 rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Individual Development Plan</p>
          <p className="text-sm text-slate-100 font-semibold">{employeeName} - {templateName}</p>
          <p className="text-[11px] text-cyan-300 mt-0.5">Role readiness: {readiness}%</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCopy}>Copy Plan</Button>
          <Button size="sm" variant="outline" onClick={onDownload}>Descargar .txt</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
          <p className="text-xs font-semibold text-slate-100">30 Days</p>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc pl-4">
            {goals30.map(goal => (
              <li key={`30-${goal}`}>{goal}</li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
          <p className="text-xs font-semibold text-slate-100">60 Days</p>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc pl-4">
            {goals60.map(goal => (
              <li key={`60-${goal}`}>{goal}</li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
          <p className="text-xs font-semibold text-slate-100">90 Days</p>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc pl-4">
            {goals90.map(goal => (
              <li key={`90-${goal}`}>{goal}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
        <p className="text-xs font-semibold text-slate-100">Revisión y aprobación del encargado</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Nombre del revisor</label>
            <input
              type="text"
              value={signoffManager}
              onChange={(e) => onSignoffManagerChange(e.target.value)}
              placeholder="Encargado / Supervisor"
              className="w-full rounded border border-[#1e293b] bg-[#0d1117] px-2 py-1.5 text-xs text-slate-200"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Fecha de revisión</label>
            <input
              type="date"
              value={signoffDate}
              onChange={(e) => onSignoffDateChange(e.target.value)}
              className="w-full rounded border border-[#1e293b] bg-[#0d1117] px-2 py-1.5 text-xs text-slate-200"
            />
          </div>
        </div>
        <div className="mt-2">
          <label className="text-[11px] text-slate-500 block mb-1">Notas del encargado</label>
          <textarea
            value={managerNotes}
            onChange={(e) => onManagerNotesChange(e.target.value)}
            placeholder="Observaciones, acciones de apoyo, restricciones y notas de aprobación..."
            rows={4}
            className="w-full rounded border border-[#1e293b] bg-[#0d1117] px-2 py-1.5 text-xs text-slate-200"
          />
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function CraftSkillTree() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading: employeesLoading } = useEmployees();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [managerNotes, setManagerNotes] = useState('');
  const [signoffManager, setSignoffManager] = useState('');
  const [signoffDate, setSignoffDate] = useState('');
  const [zoom, setZoom] = useState(0.75);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  // Fetch employee skills when one is selected
  const { data: employeeSkillsRaw = [] } = useQuery({
    queryKey: ['craft-tree', 'employee-skills', selectedEmployeeId],
    queryFn: async () => {
      if (!selectedEmployeeId) return [];
      const res = await fetch(`/api/employees/${selectedEmployeeId}/skills`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedEmployeeId,
  });

  // Fetch all skills (to map code → id)
  const { data: allDbSkills = [] } = useQuery({
    queryKey: ['skills', 'all-for-craft-tree'],
    queryFn: async () => {
      const res = await fetch('/api/skills');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  // Build proficiency map: skill code → proficiency level
  const proficiencyMap: ProficiencyMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!employeeSkillsRaw.length) return map;
    employeeSkillsRaw.forEach((es: any) => {
      const code = es.skills?.code || es.skill_code || '';
      const level = es.proficiency_level ?? 0;
      if (code) map.set(code, Math.max(map.get(code) ?? 0, level));
    });
    return map;
  }, [employeeSkillsRaw]);

  // Resolve a SKILL_NODES code → DB skill id
  const codeToDbId = useMemo(() => {
    const map = new Map<string, string>();
    allDbSkills.forEach((s: any) => {
      if (s.code) map.set(s.code, s.id);
    });
    return map;
  }, [allDbSkills]);

  const selectedEmployee = employees.find((e: any) => e.id === selectedEmployeeId);
  const selectedNode = selectedNodeId ? SKILL_NODES.find(n => n.id === selectedNodeId) : null;
  const selectedNodeState = selectedNodeId
    ? getNodeState(selectedNodeId, proficiencyMap, !!selectedEmployeeId)
    : 'locked';
  const selectedNodeProf = selectedNode ? (proficiencyMap.get(selectedNode.code) ?? 0) : 0;

  const nodeStateSummary = useMemo(() => {
    if (!selectedEmployeeId) {
      return { mastered: 0, inProgress: 0, available: 0, locked: 0 };
    }

    let mastered = 0;
    let inProgress = 0;
    let available = 0;
    let locked = 0;

    SKILL_NODES.forEach(node => {
      const state = getNodeState(node.id, proficiencyMap, true);
      if (state === 'mastered') mastered += 1;
      else if (state === 'in_progress') inProgress += 1;
      else if (state === 'available') available += 1;
      else locked += 1;
    });

    return { mastered, inProgress, available, locked };
  }, [proficiencyMap, selectedEmployeeId]);

  const tierProgress = useMemo(() => {
    return Object.entries(TIER_LABELS)
      .map(([tierKey, label]) => {
        const tier = Number(tierKey);
        const tierNodes = SKILL_NODES.filter(node => node.tier === tier);
        const completed = selectedEmployeeId
          ? tierNodes.filter(node => (proficiencyMap.get(node.code) ?? 0) >= 1).length
          : 0;

        return {
          tier,
          label,
          completed,
          total: tierNodes.length,
        };
      })
      .sort((a, b) => a.tier - b.tier);
  }, [proficiencyMap, selectedEmployeeId]);

  const nextUnlockNodes = useMemo(() => {
    if (!selectedEmployeeId) return [] as SkillNodeDef[];

    return SKILL_NODES
      .filter(node => getNodeState(node.id, proficiencyMap, true) === 'available')
      .filter(node => (proficiencyMap.get(node.code) ?? 0) === 0)
      .sort((a, b) => a.tier - b.tier)
      .slice(0, 4);
  }, [proficiencyMap, selectedEmployeeId]);

  const roleTemplateSummaries = useMemo(() => {
    if (!selectedEmployeeId) return [] as Array<{ id: string; name: string; description: string; readiness: number; missingNames: string[] }>;

    return ROLE_TARGET_TEMPLATES.map(template => {
      const readiness = getRoleTemplateReadiness(template.id, proficiencyMap);
      const missingNames = readiness.missingNodeIds
        .map(nodeId => SKILL_NODES.find(node => node.id === nodeId)?.name)
        .filter(Boolean) as string[];

      return {
        id: template.id,
        name: template.name,
        description: template.description,
        readiness: readiness.readiness,
        missingNames,
      };
    }).sort((a, b) => b.readiness - a.readiness);
  }, [proficiencyMap, selectedEmployeeId]);

  const activeTemplateId = selectedTemplateId ?? roleTemplateSummaries[0]?.id ?? null;

  const activeTemplateNodeSet = useMemo(() => {
    if (!activeTemplateId) return new Set<string>();
    const template = ROLE_TARGET_TEMPLATES.find(t => t.id === activeTemplateId);
    if (!template) return new Set<string>();

    const nodeIds = new Set<string>(template.requiredNodeIds);
    const trackIds = [template.primaryTrackId, ...template.secondaryTrackIds];

    SKILL_TRACKS
      .filter(track => trackIds.includes(track.id))
      .forEach(track => track.nodeIds.forEach(nodeId => nodeIds.add(nodeId)));

    return nodeIds;
  }, [activeTemplateId]);

  const activeTemplateMissingSet = useMemo(() => {
    if (!activeTemplateId || !selectedEmployeeId) return new Set<string>();
    const readiness = getRoleTemplateReadiness(activeTemplateId, proficiencyMap);
    return new Set<string>(readiness.missingNodeIds);
  }, [activeTemplateId, proficiencyMap, selectedEmployeeId]);

  const activeTemplate = useMemo(() => {
    if (!activeTemplateId) return null;
    return ROLE_TARGET_TEMPLATES.find(template => template.id === activeTemplateId) ?? null;
  }, [activeTemplateId]);

  const activeTemplateReadiness = useMemo(() => {
    if (!activeTemplateId || !selectedEmployeeId) return 0;
    return getRoleTemplateReadiness(activeTemplateId, proficiencyMap).readiness;
  }, [activeTemplateId, proficiencyMap, selectedEmployeeId]);

  const developmentPlan = useMemo(() => {
    if (!activeTemplate || !selectedEmployeeId) {
      return {
        goals30: [] as string[],
        goals60: [] as string[],
        goals90: [] as string[],
      };
    }

    const missingRequired = activeTemplate.requiredNodeIds
      .filter(nodeId => activeTemplateMissingSet.has(nodeId))
      .map(nodeId => SKILL_NODES.find(node => node.id === nodeId)?.name)
      .filter(Boolean) as string[];

    const inProgressNodes = SKILL_NODES
      .filter(node => getNodeState(node.id, proficiencyMap, true) === 'in_progress')
      .map(node => node.name);

    const templateTrackNames = SKILL_TRACKS
      .filter(track => [activeTemplate.primaryTrackId, ...activeTemplate.secondaryTrackIds].includes(track.id))
      .map(track => track.name);

    const goals30 = [
      ...(missingRequired.slice(0, 2).map(name => `Start and validate ${name}.`)),
      ...(nextUnlockNodes.slice(0, 1).map(node => `Assign first practice cycle for ${node.name}.`)),
    ];

    const goals60 = [
      ...(missingRequired.slice(2, 4).map(name => `Reach functional proficiency in ${name}.`)),
      ...(inProgressNodes.slice(0, 1).map(name => `Raise ${name} to at least level 3 proficiency.`)),
    ];

    const goals90 = [
      `Complete core milestones for ${activeTemplate.name}.`,
      ...(templateTrackNames.slice(0, 1).map(name => `Consolidate performance in ${name} with supervised autonomy.`)),
      'Run a practical assessment and define next promotion-readiness checkpoint.',
    ];

    return {
      goals30: goals30.length > 0 ? goals30 : ['Maintain current development cadence and complete one available unlock.'],
      goals60: goals60.length > 0 ? goals60 : ['Convert active in-progress skills into stable level 3 proficiency.'],
      goals90: goals90.length > 0 ? goals90 : ['Finalize role-readiness assessment with validated production evidence.'],
    };
  }, [activeTemplate, activeTemplateMissingSet, nextUnlockNodes, proficiencyMap, selectedEmployeeId]);

  const developmentPlanText = useMemo(() => {
    if (!selectedEmployee || !activeTemplate) return '';

    const lines = [
      'Individual Development Plan',
      `Employee: ${selectedEmployee.full_name}`,
      `Role Target: ${activeTemplate.name}`,
      `Readiness: ${activeTemplateReadiness}%`,
      '',
      '30 Days',
      ...developmentPlan.goals30.map((goal, index) => `${index + 1}. ${goal}`),
      '',
      '60 Days',
      ...developmentPlan.goals60.map((goal, index) => `${index + 1}. ${goal}`),
      '',
      '90 Days',
      ...developmentPlan.goals90.map((goal, index) => `${index + 1}. ${goal}`),
      '',
      'Manager Review and Sign-Off',
      `Reviewer: ${signoffManager || 'Pending'}`,
      `Review Date: ${signoffDate || 'Pending'}`,
      'Manager Notes:',
      managerNotes || 'Pending manager notes.',
    ];

    return lines.join('\n');
  }, [
    activeTemplate,
    activeTemplateReadiness,
    developmentPlan.goals30,
    developmentPlan.goals60,
    developmentPlan.goals90,
    managerNotes,
    selectedEmployee,
    signoffDate,
    signoffManager,
  ]);

  const handleCopyDevelopmentPlan = useCallback(async () => {
    if (!developmentPlanText) return;
    try {
      await navigator.clipboard.writeText(developmentPlanText);
      toast({ title: 'Development plan copied', description: 'IDP copied to clipboard.' });
    } catch {
      toast({ variant: 'destructive', title: 'Falló la copia', description: 'No se pudo copiar el IDP al portapapeles.' });
    }
  }, [developmentPlanText, toast]);

  const handleDownloadDevelopmentPlan = useCallback(() => {
    if (!developmentPlanText || !selectedEmployee) return;

    const safeName = selectedEmployee.full_name.replace(/\s+/g, '_').toLowerCase();
    const blob = new Blob([developmentPlanText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `idp_${safeName}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [developmentPlanText, selectedEmployee]);

  const recommendedTracks = useMemo(() => {
    if (!selectedEmployeeId) return [] as Array<{ id: string; name: string; description: string; percentage: number; completed: number; total: number }>;

    return SKILL_TRACKS
      .map(track => {
        const progress = getTrackProgress(track.id, proficiencyMap);
        return {
          id: track.id,
          name: track.name,
          description: track.description,
          percentage: progress.percentage,
          completed: progress.completed,
          total: progress.total,
        };
      })
      .sort((a, b) => b.percentage - a.percentage);
  }, [proficiencyMap, selectedEmployeeId]);

  // ── Assign / update skill ────────────────────────────────────
  const handleAssign = useCallback(async (level: number) => {
    if (!selectedEmployeeId || !selectedNode) return;

    const dbSkillId = codeToDbId.get(selectedNode.code);
    if (!dbSkillId) {
      toast({
        variant: 'destructive',
        title: 'Habilidad no encontrada',
        description: `"${selectedNode.code}" is not in the database yet. Run the seed first.`,
      });
      return;
    }

    const existingLevel = proficiencyMap.get(selectedNode.code) ?? 0;

    try {
      if (existingLevel > 0) {
        // Update
        const { error } = await supabase
          .from('employee_skills')
          .update({ proficiency_level: level, last_assessed_on: new Date().toISOString() })
          .eq('employee_id', selectedEmployeeId)
          .eq('skill_id', dbSkillId);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('employee_skills')
          .insert({
            employee_id: selectedEmployeeId,
            skill_id: dbSkillId,
            proficiency_level: level,
            certified: false,
            last_assessed_on: new Date().toISOString(),
          });
        if (error) throw error;
      }

      toast({
        title: existingLevel > 0 ? 'Proficiency updated' : 'Skill assigned',
        description: `${selectedNode.name} set to level ${level} for ${selectedEmployee?.full_name ?? 'employee'}`,
      });

      queryClient.invalidateQueries({
        queryKey: ['craft-tree', 'employee-skills', selectedEmployeeId],
      });
      queryClient.invalidateQueries({ queryKey: ['hr', 'employeeSkills'] });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  }, [selectedEmployeeId, selectedNode, codeToDbId, proficiencyMap, selectedEmployee, queryClient, toast]);

  // ── Connection states for rendering ────────────────────────────
  const connectionStates = useMemo(() => {
    return CONNECTIONS.map(conn => {
      const fromState = getNodeState(conn.from, proficiencyMap, !!selectedEmployeeId);
      const toState = getNodeState(conn.to, proficiencyMap, !!selectedEmployeeId);
      const active = (
        !selectedEmployeeId ||
        fromState === 'mastered' ||
        fromState === 'in_progress' ||
        fromState === 'available' ||
        toState === 'in_progress' ||
        toState === 'mastered'
      );
      return { conn, active };
    });
  }, [proficiencyMap, selectedEmployeeId]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-[#1e293b] bg-[#0a0a14]">
      {/* ── Top controls bar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#0d1117]/90 border-b border-[#1e293b] backdrop-blur z-10 relative">
        <div className="flex items-center gap-3">
          <Award className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-200">Rutas de oficios</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Employee selector */}
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-500" />
            <Select
              value={selectedEmployeeId ?? '__none__'}
              onValueChange={v => {
                setSelectedEmployeeId(v === '__none__' ? null : v);
                setSelectedNodeId(null);
                setSelectedTemplateId(null);
                setManagerNotes('');
                setSignoffManager('');
                setSignoffDate('');
              }}
            >
              <SelectTrigger className="w-[200px] h-8 text-xs bg-[#0d1117] border-[#1e293b] text-slate-300">
                <SelectValue placeholder="Seleccionar empleado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin empleado (ver todos)</SelectItem>
                {employees.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={activeTemplateId ?? '__none__'}
              onValueChange={v => setSelectedTemplateId(v === '__none__' ? null : v)}
              disabled={!selectedEmployeeId}
            >
              <SelectTrigger className="w-[240px] h-8 text-xs bg-[#0d1117] border-[#1e293b] text-slate-300">
                <SelectValue placeholder="Plantilla de rol objetivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Automático (plantilla más adecuada)</SelectItem>
                {ROLE_TARGET_TEMPLATES.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border-l border-[#1e293b] pl-3">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200"
              onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[10px] text-slate-500 w-8 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200"
              onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <TalentDevelopmentGuide
        selectedEmployeeName={selectedEmployee?.full_name ?? null}
        tierProgress={tierProgress}
        masteredCount={nodeStateSummary.mastered}
        inProgressCount={nodeStateSummary.inProgress}
        availableCount={nodeStateSummary.available}
        nextUnlockNodes={nextUnlockNodes}
        recommendedTracks={recommendedTracks}
        roleTemplateSummaries={roleTemplateSummaries}
        selectedTemplateId={activeTemplateId}
      />

      {selectedEmployee && activeTemplate && (
        <IndividualDevelopmentPlanPanel
          employeeName={selectedEmployee.full_name}
          templateName={activeTemplate.name}
          readiness={activeTemplateReadiness}
          goals30={developmentPlan.goals30}
          goals60={developmentPlan.goals60}
          goals90={developmentPlan.goals90}
          managerNotes={managerNotes}
          signoffManager={signoffManager}
          signoffDate={signoffDate}
          onManagerNotesChange={setManagerNotes}
          onSignoffManagerChange={setSignoffManager}
          onSignoffDateChange={setSignoffDate}
          onCopy={handleCopyDevelopmentPlan}
          onDownload={handleDownloadDevelopmentPlan}
        />
      )}

      {/* ── SVG Canvas ───────────────────────────────────────────── */}
      <div
        className="overflow-auto"
        style={{ maxHeight: '700px' }}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          width={VIEWBOX.width * zoom}
          height={VIEWBOX.height * zoom}
          xmlns="http://www.w3.org/2000/svg"
          style={{ minWidth: VIEWBOX.width * zoom }}
        >
          <SvgDefs />

          {/* Background */}
          <rect
            x="0"
            y="0"
            width={VIEWBOX.width}
            height={VIEWBOX.height}
            fill="url(#bg-vignette)"
          />

          {/* Tier labels */}
          <TierLabels />

          {/* Branch trunk lines (decorative) */}
          <BranchTrunks />

          {/* Connection paths */}
          {connectionStates.map(({ conn, active }, i) => {
            const fromNode = SKILL_NODES.find(n => n.id === conn.from);
            const toNode = SKILL_NODES.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return null;
            return (
              <ConnectionPath
                key={`conn-${i}`}
                fromNode={fromNode}
                toNode={toNode}
                branch={conn.branch}
                state={active ? 'active' : 'inactive'}
              />
            );
          })}

          {/* Skill nodes */}
          {SKILL_NODES.map(node => {
            const state = getNodeState(node.id, proficiencyMap, !!selectedEmployeeId);
            const prof = proficiencyMap.get(node.code) ?? 0;
            return (
              <SkillNodeCircle
                key={node.id}
                node={node}
                state={state}
                proficiency={prof}
                isSelected={selectedNodeId === node.id}
                templateHighlight={activeTemplateNodeSet.has(node.id)}
                templateMissing={activeTemplateMissingSet.has(node.id)}
                onClick={() => setSelectedNodeId(prev => prev === node.id ? null : node.id)}
              />
            );
          })}
        </svg>
      </div>

      {/* ── Bottom legend ────────────────────────────────────────── */}
      <BranchLegend proficiencyMap={proficiencyMap} hasEmployee={!!selectedEmployeeId} />

      {/* ── Detail panel (slides from right) ─────────────────────── */}
      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          state={selectedNodeState}
          proficiency={selectedNodeProf}
          employeeId={selectedEmployeeId}
          employeeName={selectedEmployee?.full_name ?? ''}
          onClose={() => setSelectedNodeId(null)}
          onAssign={handleAssign}
        />
      )}
    </div>
  );
}
