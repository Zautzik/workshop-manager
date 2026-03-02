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
  TIER_LABELS,
  VIEWBOX,
  getNodeState,
  getBranchProgress,
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
  onClick,
}: {
  node: SkillNodeDef;
  state: NodeState;
  proficiency: number;
  isSelected: boolean;
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
            <span className="text-slate-500 block mb-0.5">Category</span>
            <span className="text-slate-300 font-medium">{node.category}</span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Proficiency</span>
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

// ── Main component ───────────────────────────────────────────────────

export default function CraftSkillTree() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading: employeesLoading } = useEmployees();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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

  // ── Assign / update skill ────────────────────────────────────
  const handleAssign = useCallback(async (level: number) => {
    if (!selectedEmployeeId || !selectedNode) return;

    const dbSkillId = codeToDbId.get(selectedNode.code);
    if (!dbSkillId) {
      toast({
        variant: 'destructive',
        title: 'Skill not found',
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
          <h2 className="text-sm font-semibold text-slate-200">Craft Skill Paths</h2>
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
              }}
            >
              <SelectTrigger className="w-[200px] h-8 text-xs bg-[#0d1117] border-[#1e293b] text-slate-300">
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No employee (view all)</SelectItem>
                {employees.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
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

          {/* Decorative background stars */}
          {Array.from({ length: 60 }).map((_, i) => (
            <circle
              key={`star-${i}`}
              cx={((i * 137 + 43) % VIEWBOX.width)}
              cy={((i * 89 + 17) % VIEWBOX.height)}
              r={0.5 + (i % 3) * 0.3}
              fill="#334155"
              opacity={0.3 + (i % 4) * 0.1}
            />
          ))}

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
