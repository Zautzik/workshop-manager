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
import { Award, ZoomIn, ZoomOut, User } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { useEmployees } from '@/hooks/use-employees';
import { supabase } from '@/integrations/supabase/client';
import {
  SKILL_NODES,
  CONNECTIONS,
  SKILL_TRACKS,
  ROLE_TARGET_TEMPLATES,
  TIER_LABELS,
  VIEWBOX,
  getNodeState,
  getTrackProgress,
  getRoleTemplateReadiness,
  type SkillNodeDef,
  type ProficiencyMap,
} from '@/lib/craft-skill-paths';
import { SvgDefs } from './skill-tree/SvgDefs';
import { ConnectionPath } from './skill-tree/ConnectionPath';
import { SkillNodeCircle } from './skill-tree/SkillNodeCircle';
import { TierLabels } from './skill-tree/TierLabels';
import { BranchTrunks } from './skill-tree/BranchTrunks';
import { NodeDetailPanel } from './skill-tree/NodeDetailPanel';
import { BranchLegend } from './skill-tree/BranchLegend';
import { TalentDevelopmentGuide } from './skill-tree/TalentDevelopmentGuide';
import { IndividualDevelopmentPlanPanel } from './skill-tree/IndividualDevelopmentPlanPanel';

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
      // One upsert covers both cases — the route resolves insert-vs-update.
      const res = await fetch('/api/employees/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          skill_id: dbSkillId,
          proficiency_level: level,
          certified: false,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo guardar la competencia');
      }

      toast({
        title: existingLevel > 0 ? 'Nivel actualizado' : 'Competencia asignada',
        description: `${selectedNode.name} quedó en nivel ${level} para ${selectedEmployee?.full_name ?? 'el empleado'}`,
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
