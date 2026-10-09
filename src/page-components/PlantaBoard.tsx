'use client';

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WorkerStatsPanel } from "@/components/workflow/WorkerStatsPanel";
import { WeekendShiftRotation } from "@/components/workflow/WeekendShiftRotation";
const WorkstationLayout = dynamic(() => import('@/components/workflow/WorkstationLayout').then((m) => m.WorkstationLayout));
import { Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompensationRatesForDate, useSchedulingCostModel, useWorkerAssignments, useWorkerMonthlyOvertime, useWorkflowCertificationAlerts, useWorkflowContracts, useWorkflowIncentiveStatuses, useWorkflowLeaveStatuses, useWorkflowWeeklyHours, useWorkersByRating, useWorkstations, useShifts } from "@/hooks/use-workflow-queries";
import { useRealtimeProduction } from "@/hooks/use-realtime-production";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { isWorkerQualifiedForStation } from "@/lib/workstation-skills";
import { isWorkerEligibleForStation, workerConflictFlags, workerSortScore } from "@/lib/worker-eligibility";
import { useStationsUnderMaintenance } from "@/hooks/use-maintenance-queries";
import { dateToLocalIso, startOfIsoWeek, weekDatesFrom } from "@/lib/week-dates";
import { SelectedOTBanner } from "./planta-board/SelectedOTBanner";
import { AgendaSemanalSidebar } from "./planta-board/AgendaSemanalSidebar";
import { BulkActionsPanel } from "./planta-board/BulkActionsPanel";
import { QuickRosterPanel } from "./planta-board/QuickRosterPanel";
import { CostModelPanel } from "./planta-board/CostModelPanel";

type WorkflowTab = 'en_proceso' | 'ots' | 'clients' | 'layout' | 'shifts' | 'production' | 'hoja_prod' | 'plan_semanal' | 'gantt' | 'calendar' | 'whatsapp';

// Un objeto literal `= {}` como default de useQuery crea una identidad nueva
// en cada render mientras la data no llega — suficiente para invalidar
// cualquier memo/React.memo río abajo que reciba este valor como prop
// (auditoría de performance 2026-09, ver WorkstationLayout.tsx).
const EMPTY_OVERTIME_BY_WORKER: Record<string, { hours: number; shifts: number }> = {};

interface PlantaBoardProps {
  /** Retained for compatibility; the board now renders only the planta layout. */
  initialTab?: WorkflowTab;
}

export default function PlantaBoard({ initialTab = 'layout' }: PlantaBoardProps) {
  const router = useRouter();
  useRealtimeProduction();

  // Fecha/semana: src/lib/week-dates.ts — antes reimplementado acá mismo,
  // y con una diferencia real de comportamiento contra la copia que vivía
  // en HojaProduccion.tsx (auditoría 2026-08, ver el comentario del módulo).
  const today = new Date();
  const [activeTab, setActiveTab] = useState<WorkflowTab>(initialTab);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [selectedOT, setSelectedOT] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>(dateToLocalIso(today));
  const [weekStartDate, setWeekStartDate] = useState<Date>(startOfIsoWeek(today));
  const { data: workersData = [] } = useWorkersByRating();
  const { data: workstationsData = [] } = useWorkstations();
  const { data: shifts = [] } = useShifts();
  const { data: assignments = [], refetch: refetchAssignments } = useWorkerAssignments(selectedDate);
  const { data: monthlyOvertimeByWorker = EMPTY_OVERTIME_BY_WORKER } = useWorkerMonthlyOvertime(selectedDate);
  const { data: stationsUnderMaintenance, isError: maintenanceCheckFailed } = useStationsUnderMaintenance();
  const { data: compensationRates = [] } = useCompensationRatesForDate(selectedDate);
  const { data: workflowLeaveStatuses = [] } = useWorkflowLeaveStatuses(selectedDate);
  const { data: workflowIncentiveStatuses = [] } = useWorkflowIncentiveStatuses(selectedDate);
  const { data: workflowCertificationAlerts = [] } = useWorkflowCertificationAlerts(selectedDate);
  const { data: workflowContracts = [] } = useWorkflowContracts(selectedDate);
  const { data: workflowWeeklyHours = {} } = useWorkflowWeeklyHours(selectedDate);
  const { data: costModel, refetch: refetchCostModel } = useSchedulingCostModel();
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState<'auto-fill' | 'replace-conflicts' | 'redistribute-ot' | null>(null);
  const [quickSetupLoading, setQuickSetupLoading] = useState<'copy-day' | 'repeat-last-week' | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishedWeeks, setPublishedWeeks] = useState<Record<string, string>>({});
  const [lastWeekValidation, setLastWeekValidation] = useState<{
    weekStart: string;
    weekEnd: string;
    legalViolations: number;
    leaveViolations: number;
    details: string[];
  } | null>(null);
  const { toast } = useToast();
  const { role } = useAuth();

  const [fallbackWorkers, setFallbackWorkers] = useState<any[]>([]);
  const [fallbackWorkstations, setFallbackWorkstations] = useState<any[]>([]);

  const workers = workersData.length > 0 ? workersData : fallbackWorkers;
  const rawWorkstations = workstationsData.length > 0 ? workstationsData : fallbackWorkstations;
  const workstations = rawWorkstations.filter((station: any) => {
    const type = String(station?.type || '').toLowerCase().trim();
    return !/pre\s*-?\s*press|pre\s*-?\s*prensa|pre_press|preprensa/.test(type);
  });

  const canManageCostModel = role === 'admin';

  // Collapse raw shift rows (often stored per-date) into a few clean toggles
  // (e.g. "Turno Día" / "Turno Tarde") instead of an unwieldy per-date list.
  const shiftToggleOptions = useMemo(() => {
    // The shop runs two logical shifts. Bucket the (often messy) shift rows into
    // "Día" / "Tarde" by keyword so the toggle stays to two clean options.
    const dia = { label: 'Día', ids: [] as string[] };
    const tarde = { label: 'Tarde', ids: [] as string[] };
    for (const s of shifts as any[]) {
      const n = String(s?.name ?? '').toLowerCase();
      const isTarde = /tarde|afternoon|noche|night|evening/.test(n);
      (isTarde ? tarde : dia).ids.push(s.id);
    }
    return [dia, tarde].filter((g) => g.ids.length > 0);
  }, [shifts]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const needsWorkersFallback = workersData.length === 0 && fallbackWorkers.length === 0;
    const needsWorkstationsFallback = workstationsData.length === 0 && fallbackWorkstations.length === 0;

    if (!needsWorkersFallback && !needsWorkstationsFallback) return;

    let cancelled = false;

    const loadFallbackData = async () => {
      try {
        if (needsWorkersFallback) {
          const workersRes = await fetch('/api/workers?limit=200', { credentials: 'include' });
          if (workersRes.ok) {
            const workersPayload = await workersRes.json();
            const workersList = Array.isArray(workersPayload)
              ? workersPayload
              : (workersPayload?.data ?? []);
            if (!cancelled) setFallbackWorkers(workersList);
          }
        }

        if (needsWorkstationsFallback) {
          const workstationsRes = await fetch('/api/workstations', { credentials: 'include' });
          if (workstationsRes.ok) {
            const workstationsPayload = await workstationsRes.json();
            const workstationsList = Array.isArray(workstationsPayload)
              ? workstationsPayload
              : (workstationsPayload?.data ?? []);
            if (!cancelled) setFallbackWorkstations(workstationsList);
          }
        }
      } catch {
        // Silent fallback failure: primary queries continue retrying.
      }
    };

    loadFallbackData();

    const retryId = window.setInterval(() => {
      if (cancelled) return;
      const stillNeedsWorkers = workersData.length === 0 && fallbackWorkers.length === 0;
      const stillNeedsWorkstations = workstationsData.length === 0 && fallbackWorkstations.length === 0;
      if (!stillNeedsWorkers && !stillNeedsWorkstations) return;
      loadFallbackData();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(retryId);
    };
  }, [workersData.length, workstationsData.length, fallbackWorkers.length, fallbackWorkstations.length]);

  useEffect(() => {
    if (!selectedShiftId && shifts.length > 0) {
      setSelectedShiftId(shifts[0].id);
    }
  }, [selectedShiftId, shifts]);

  // useCallback con identidad estable: pasa por WorkstationLayout hasta cada
  // tarjeta de operario, y una identidad nueva en cada render de PlantaBoard
  // (dos por drag, uno por `activeId`) rompía el React.memo de esas tarjetas
  // sin que nada relevante hubiera cambiado (auditoría de performance 2026-09).
  const handleWorkerSelect = useCallback((worker: any) => {
    setSelectedWorker(worker);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('workflow_week_publications');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setPublishedWeeks(parsed);
      }
    } catch {
      // ignore local storage errors
    }
  }, []);

  const weekDates = weekDatesFrom(weekStartDate);
  const weekStartIso = dateToLocalIso(weekStartDate);
  const weekEndIso = dateToLocalIso(new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 6));

  const persistPublishedWeeks = (nextValue: Record<string, string>) => {
    setPublishedWeeks(nextValue);
    try {
      localStorage.setItem('workflow_week_publications', JSON.stringify(nextValue));
    } catch {
      // ignore local storage errors
    }
  };

  const goToPreviousWeek = () => {
    const previous = new Date(weekStartDate);
    previous.setDate(previous.getDate() - 7);
    setWeekStartDate(previous);
  };

  const goToNextWeek = () => {
    const next = new Date(weekStartDate);
    next.setDate(next.getDate() + 7);
    setWeekStartDate(next);
  };

  const applyShiftRosterFromDate = async (sourceDate: string, setupLabel: string) => {
    if (!selectedShiftId) {
      toast({
        title: 'Seleccione primero un turno',
        description: 'Elija un turno antes de aplicar una configuración rápida de plantilla.',
        variant: 'destructive',
      });
      return;
    }

    if (sourceDate === selectedDate) {
      toast({
        title: 'Source and target are the same day',
        description: 'Elija otro día desde el cual copiar la configuración de la plantilla.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: sourceAssignments, error: sourceError } = await supabase
        .from('worker_assignments')
        .select('employee_id, worker_id, machine_id, role, ot_id')
        .eq('date', sourceDate)
        .eq('shift_id', selectedShiftId);

      if (sourceError) throw sourceError;

      if (!sourceAssignments || sourceAssignments.length === 0) {
        toast({
          title: 'No se encontró una plantilla de origen',
          description: `No assignments exist for ${setupLabel}.`,
          variant: 'destructive',
        });
        return;
      }

      const deleteRes = await fetch(
        `/api/worker-assignments?date=${encodeURIComponent(selectedDate)}&shiftId=${encodeURIComponent(selectedShiftId)}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!deleteRes.ok) {
        const body = await deleteRes.json().catch(() => null);
        throw new Error(body?.error || 'Failed to clear existing assignments');
      }

      const payload = sourceAssignments.map((assignment: any) => ({
        employee_id: assignment.employee_id,
        worker_id: assignment.worker_id,
        machine_id: assignment.machine_id,
        shift_id: selectedShiftId,
        date: selectedDate,
        role: assignment.role,
        ot_id: selectedOT?.id || assignment.ot_id || null,
      }));

      const insertRes = await fetch('/api/worker-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!insertRes.ok) {
        const body = await insertRes.json().catch(() => null);
        throw new Error(body?.error || 'Failed to copy assignments');
      }

      refetchAssignments();
      toast({
        title: 'Dotación copiada',
        description: `Se copiaron ${payload.length} asignaciones desde ${setupLabel}.`,
      });
    } catch (error: any) {
      toast({
        title: 'No se pudo aplicar la configuración rápida',
        description: error.message || 'Unexpected error while copying roster setup.',
        variant: 'destructive',
      });
    }
  };

  const handleCopyFromWeekDay = async (sourceDate: string) => {
    setQuickSetupLoading('copy-day');
    try {
      await applyShiftRosterFromDate(sourceDate, sourceDate);
    } finally {
      setQuickSetupLoading(null);
    }
  };

  const handleRepeatLastWeekSetup = async () => {
    setQuickSetupLoading('repeat-last-week');
    try {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() - 7);
      const sourceDate = dateToLocalIso(date);
      await applyShiftRosterFromDate(sourceDate, `${sourceDate} (last week)`);
    } finally {
      setQuickSetupLoading(null);
    }
  };

  const shiftHours = useMemo(() => {
    const shift = shifts.find((item: any) => item.id === selectedShiftId);
    if (!shift?.start_time || !shift?.end_time) return 0;

    const toMinutes = (value: string) => {
      const [hours, minutes] = value.split(':').map(Number);
      return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
    };

    const startMinutes = toMinutes(shift.start_time);
    const endMinutes = toMinutes(shift.end_time);
    let durationMinutes = endMinutes - startMinutes;
    if (durationMinutes <= 0) durationMinutes += 24 * 60;
    return durationMinutes / 60;
  }, [shifts, selectedShiftId]);

  const compensationByEmployee = useMemo(() => {
    const map: Record<string, any> = {};
    compensationRates.forEach((rate: any) => {
      if (rate?.employee_id) {
        map[rate.employee_id] = rate;
      }
    });
    return map;
  }, [compensationRates]);

  const shiftContext = useMemo(() => {
    const day = new Date(selectedDate).getDay();
    const isWeekend = day === 0 || day === 6;
    const shift = shifts.find((item: any) => item.id === selectedShiftId);
    if (!shift?.start_time || !shift?.end_time) {
      return { isWeekend, isNightShift: false };
    }

    const toMinutes = (value: string) => {
      const [hours, minutes] = value.split(':').map(Number);
      return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
    };

    const startMinutes = toMinutes(shift.start_time);
    const endMinutes = toMinutes(shift.end_time);
    const nightStart = 20 * 60;
    const nightEnd = 6 * 60;

    const startsAtNight = startMinutes >= nightStart || startMinutes < nightEnd;
    const endsAtNight = endMinutes >= nightStart || endMinutes < nightEnd;

    return { isWeekend, isNightShift: startsAtNight || endsAtNight };
  }, [selectedDate, selectedShiftId, shifts]);

  const workerIndicatorsById = useMemo(() => {
    const contractsByEmployee = new Map<string, any>();
    workflowContracts.forEach((contract: any) => {
      if (!contract?.employee_id) return;
      if (!contractsByEmployee.has(contract.employee_id)) {
        contractsByEmployee.set(contract.employee_id, contract);
      }
    });

    const leaveByEmployee = new Map<string, any>();
    workflowLeaveStatuses.forEach((leave: any) => {
      const employeeId = leave.employee_id;
      if (!employeeId) return;
      const existing = leaveByEmployee.get(employeeId);
      if (!existing || (leave.status === 'approved' && existing.status !== 'approved')) {
        leaveByEmployee.set(employeeId, leave);
      }
    });

    const incentiveByEmployee = new Map<string, any[]>();
    workflowIncentiveStatuses.forEach((incentive: any) => {
      const employeeId = incentive.employee_id;
      if (!employeeId) return;
      const existing = incentiveByEmployee.get(employeeId) || [];
      existing.push(incentive);
      incentiveByEmployee.set(employeeId, existing);
    });

    const certByEmployee = new Map<string, any[]>();
    workflowCertificationAlerts.forEach((doc: any) => {
      const employeeId = doc.employee_id;
      if (!employeeId) return;
      const existing = certByEmployee.get(employeeId) || [];
      existing.push(doc);
      certByEmployee.set(employeeId, existing);
    });

    const today = new Date(selectedDate);
    const daysUntil = (value?: string | null) => {
      if (!value) return Number.POSITIVE_INFINITY;
      const date = new Date(value);
      return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const result: Record<string, any> = {};
    workers.forEach((worker: any) => {
      const employeeId = worker.id;

      const leave = leaveByEmployee.get(employeeId);
      const leaveStatus = leave
        ? leave.status === 'approved'
          ? `On leave (${leave.leave_type})`
          : 'Leave pending'
        : 'Available';
      const leaveTone = leave
        ? leave.status === 'approved'
          ? 'alert'
          : 'warn'
        : 'ok';

      const incentives = incentiveByEmployee.get(employeeId) || [];
      const hasAwardedIncentive = incentives.some((item: any) =>
        ['approved', 'paid'].includes(String(item.status || '').toLowerCase())
      );
      const incentiveStatus = hasAwardedIncentive
        ? 'Awarded this month'
        : Number(worker?.attendance_score ?? 0) >= 90 && Number(worker?.overall_rating ?? 0) >= 75
          ? 'Eligible'
          : 'Review';
      const incentiveTone = hasAwardedIncentive
        ? 'ok'
        : incentiveStatus === 'Eligible'
          ? 'ok'
          : 'warn';

      const certDocs = certByEmployee.get(employeeId) || [];
      let certificationAlert = '';
      let certificationTone = 'ok';
      if (certDocs.length > 0) {
        const urgency = certDocs
          .map((doc: any) => ({
            doc,
            days: daysUntil(doc.expires_on),
          }))
          .sort((a, b) => a.days - b.days)[0];

        if (urgency.days < 0) {
          certificationAlert = 'Certification expired';
          certificationTone = 'alert';
        } else if (urgency.days <= 7) {
          certificationAlert = `Certification expires in ${urgency.days} day(s)`;
          certificationTone = 'alert';
        } else {
          certificationAlert = `Certification due in ${urgency.days} day(s)`;
          certificationTone = 'warn';
        }
      }

      const contract = contractsByEmployee.get(employeeId);
      const weeklyHours = Number(workflowWeeklyHours?.[employeeId] || 0);
      const maxWeeklyHours = Number(contract?.max_hours_per_week ?? 0);
      const baseWeeklyHours = Number(contract?.base_hours_per_week ?? 0);
      const overtimeCap = Number(contract?.overtime_cap_hours_per_week ?? 0);
      const weeklyOvertime = Math.max(0, weeklyHours - baseWeeklyHours);

      const legalHourConflict =
        (maxWeeklyHours > 0 && weeklyHours > maxWeeklyHours) ||
        (overtimeCap > 0 && weeklyOvertime > overtimeCap);

      result[employeeId] = {
        leaveStatus,
        leaveTone,
        incentiveStatus,
        incentiveTone,
        certificationAlert,
        certificationTone,
        legalHourConflict,
      };
    });

    return result;
  }, [selectedDate, workers, workflowLeaveStatuses, workflowIncentiveStatuses, workflowCertificationAlerts, workflowContracts, workflowWeeklyHours]);

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  // useCallback por la misma razón que handleWorkerSelect: llega hasta cada
  // tarjeta de operario vía WorkstationLayout, y sin identidad estable
  // invalida su memo en cada render de PlantaBoard.
  const handleUnassignWorker = useCallback(async (assignmentId?: string, workerName?: string) => {
    if (!assignmentId) return;

    try {
      const res = await fetch(`/api/worker-assignments/${assignmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to unassign worker');
      }

      toast({
        title: "Worker unassigned",
        description: `${workerName || "Worker"} was removed from this shift assignment.`
      });

      refetchAssignments();
    } catch (error: any) {
      toast({
        title: "Error al desasignar trabajador",
        description: error.message,
        variant: "destructive"
      });
    }
  }, [toast, refetchAssignments]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const workerData = active.data.current;
    const workstationData = over.data.current;

    if (!workerData || !workstationData) return;

    const worker = workerData.worker;
    const assignmentId = workerData.assignmentId;
    const workstation = workstationData.workstation;
    const dropAction = workstationData.action;

    if (dropAction === "unassign") {
      await handleUnassignWorker(assignmentId, worker?.name);
      return;
    }

    if (!selectedShiftId) {
      toast({
        title: "Seleccione primero un turno",
        description: "Elija un turno en la configuración de diseño antes de asignar trabajadores.",
        variant: "destructive"
      });
      return;
    }

    if (!isWorkerQualifiedForStation(worker, workstation)) {
      const workerName = worker?.name || worker?.full_name || 'This worker';
      toast({
        title: "No se cumple el requisito de habilidad",
        description: `${workerName} doesn't meet the required skills for ${workstation.name}.`,
        variant: "destructive"
      });
      return;
    }

    const shiftAssignments = assignments.filter(a => a.shift_id === selectedShiftId);
    // `worker_assignments.workstation_id` was dropped in the workstations→
    // machines merge — comparing against it always failed, so this capacity
    // check never saw any existing assignment and over-assignment went
    // undetected (2026-08 audit).
    const currentAssignments = shiftAssignments.filter(a => a.machine_id === workstation.id);
    if (currentAssignments.length >= workstation.max_workers) {
      toast({
        title: "Workstation at capacity",
        description: `${workstation.name} is already at maximum capacity`,
        variant: "destructive"
      });
      return;
    }

    const workerAssignmentsToday = assignments.filter(
      a => a.employee_id === worker.id || a.worker_id === worker.id
    );
    const workerAssignmentInSelectedShift = workerAssignmentsToday.find(
      a => a.shift_id === selectedShiftId
    );

    const hasAssignmentInOtherShift = workerAssignmentsToday.some(
      a => a.shift_id !== selectedShiftId
    );

    if (!assignmentId && workerAssignmentInSelectedShift) {
      toast({
        title: "Worker already assigned in this shift",
        description: `${worker.name} is already assigned in the selected shift.`,
        variant: "destructive"
      });
      return;
    }

    const isOvertimeAssignment = hasAssignmentInOtherShift;
    if (isOvertimeAssignment && !worker.overtime_availability) {
      toast({
        title: "Horas extra no disponibles",
        description: `${worker.name} is already assigned in another shift and is not marked as overtime available.`,
        variant: "destructive"
      });
      return;
    }

    const assignmentRole = isOvertimeAssignment ? "overtime_operator_50" : "operator";

    try {
      if (assignmentId) {
        const draggedAssignment = assignments.find(a => a.id === assignmentId);

        // Was a raw browser→Supabase write, gated by RLS requiring
        // has_role(auth.uid(), supervisor|admin). Under dev bypass the browser
        // never gets a real Supabase session (DevBypassProvider only fakes the
        // React-level user/role, it never calls supabase.auth.setSession), so
        // auth.uid() is NULL and every one of these writes was silently
        // rejected — reads still worked fine (SELECT policy is USING (true)),
        // which is why the board rendered correctly but assigning never stuck.
        // Routed through the existing authenticated API route instead (2026-07-23).
        const res = await fetch(`/api/worker-assignments/${assignmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            workstation_id: workstation.id,
            ot_id: selectedOT?.id || null,
            role: draggedAssignment?.role || assignmentRole,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Failed to update assignment');
        }
      } else {
        const res = await fetch('/api/worker-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            employee_id: worker.id,
            workstation_id: workstation.id,
            shift_id: selectedShiftId,
            date: selectedDate,
            role: assignmentRole,
            ot_id: selectedOT?.id || null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Failed to create assignment');
        }
      }

      toast({
        title: isOvertimeAssignment ? "Overtime assignment saved" : "Worker assigned successfully",
        description: isOvertimeAssignment
          ? `${worker.name} assigned to ${workstation.name} with overtime (+50% salary).`
          : `${worker.name} assigned to ${workstation.name}`
      });

      refetchAssignments();
    } catch (error: any) {
      toast({
        title: "Error al asignar trabajador",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const currentShiftAssignments = useMemo(
    () => assignments.filter((assignment: any) => assignment.shift_id === selectedShiftId),
    [assignments, selectedShiftId]
  );

  const selectedShiftAssignedWorkerIds = useMemo(
    () => new Set(currentShiftAssignments.map((assignment: any) => assignment.employee_id || assignment.worker_id)),
    [currentShiftAssignments]
  );

  const workersAssignedOtherShifts = useMemo(
    () => new Set(
      assignments
        .filter((assignment: any) => assignment.shift_id !== selectedShiftId)
        .map((assignment: any) => assignment.employee_id || assignment.worker_id)
    ),
    [assignments, selectedShiftId]
  );

  const sortScoreFor = (worker: any, isOvertime: boolean) =>
    workerSortScore(worker, Number(compensationByEmployee?.[worker?.id]?.hourly_rate || 0), isOvertime);

  const handleBulkAutoFillShift = async () => {
    if (!selectedShiftId) {
      toast({ title: 'Seleccione primero un turno', variant: 'destructive' });
      return;
    }
    // No se puede confirmar qué estaciones están en mantención — auto-llenar
    // igual asignaría gente a una prensa que podría estar fuera de servicio.
    // "No sé" no es "está libre" (auditoría 2026-08).
    if (maintenanceCheckFailed) {
      toast({
        title: 'No se pudo verificar mantención',
        description: 'El llenado automático está bloqueado hasta poder confirmar qué estaciones están fuera de servicio.',
        variant: 'destructive',
      });
      return;
    }

    setBulkActionLoading('auto-fill');
    try {
      const reservedWorkerIds = new Set<string>(Array.from(selectedShiftAssignedWorkerIds) as string[]);
      let inserted = 0;
      let skipped = 0;

      for (const station of workstations) {
        // A machine under maintenance gets no crew, however much capacity it
        // nominally has — the UI blocks the drag, so auto-fill must agree.
        if (stationsUnderMaintenance?.[station.id]) {
          skipped += 1;
          continue;
        }
        // Same dropped-column bug as the manual-assign capacity check above:
        // the real FK is `machine_id`.
        const stationAssignments = currentShiftAssignments.filter((assignment: any) => assignment.machine_id === station.id);
        const capacityLeft = Math.max(0, Number(station.max_workers || 0) - stationAssignments.length);
        if (capacityLeft <= 0) continue;

        const candidates = workers
          .filter((worker: any) => !reservedWorkerIds.has(worker.id))
          .map((worker: any): { worker: any; isOvertime: boolean } => {
            const isOvertime = workersAssignedOtherShifts.has(worker.id);
            return { worker, isOvertime };
          })
          .filter(({ worker, isOvertime }: { worker: any; isOvertime: boolean }) => isWorkerEligibleForStation(worker, station, isOvertime, workerIndicatorsById?.[worker.id]))
          .sort((a: { worker: any; isOvertime: boolean }, b: { worker: any; isOvertime: boolean }) => sortScoreFor(b.worker, b.isOvertime) - sortScoreFor(a.worker, a.isOvertime));

        for (const candidate of candidates.slice(0, capacityLeft)) {
          const role = candidate.isOvertime ? 'overtime_operator_50' : 'operator';
          const res = await fetch('/api/worker-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              employee_id: candidate.worker.id,
              workstation_id: station.id,
              shift_id: selectedShiftId,
              date: selectedDate,
              role,
              ot_id: selectedOT?.id || null,
            }),
          });

          if (!res.ok) {
            skipped += 1;
            continue;
          }
          reservedWorkerIds.add(candidate.worker.id);
          inserted += 1;
        }
      }

      refetchAssignments();
      toast({
        title: 'Autocompletado finalizado',
        description: `Assigned ${inserted} workers${skipped ? `, skipped ${skipped}` : ''}.`,
      });
    } catch (error: any) {
      toast({ title: 'Falló el autocompletado', description: error.message, variant: 'destructive' });
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleReplaceConflictedAssignments = async () => {
    if (!selectedShiftId) {
      toast({ title: 'Seleccione primero un turno', variant: 'destructive' });
      return;
    }

    setBulkActionLoading('replace-conflicts');
    try {
      const reservedWorkerIds = new Set<string>(Array.from(selectedShiftAssignedWorkerIds) as string[]);
      let replaced = 0;
      let unresolved = 0;

      const conflictedAssignments = currentShiftAssignments.filter((assignment: any) => {
        const workerId = assignment.employee_id || assignment.worker_id;
        const worker = workers.find((entry: any) => entry.id === workerId);
        const conflicts = workerConflictFlags(workerId, worker, assignment.workstation, workerIndicatorsById?.[workerId]);
        return conflicts.leaveConflict || conflicts.legalConflict || conflicts.missingSkill;
      });

      for (const assignment of conflictedAssignments) {
        const currentWorkerId = assignment.employee_id || assignment.worker_id;
        const station = assignment.workstation;

        const replacement = workers
          .filter((worker: any) => !reservedWorkerIds.has(worker.id) || worker.id === currentWorkerId)
          .filter((worker: any) => worker.id !== currentWorkerId)
          .map((worker: any): { worker: any; isOvertime: boolean } => {
            const isOvertime = workersAssignedOtherShifts.has(worker.id);
            return { worker, isOvertime };
          })
          .filter(({ worker, isOvertime }: { worker: any; isOvertime: boolean }) => isWorkerEligibleForStation(worker, station, isOvertime, workerIndicatorsById?.[worker.id]))
          .sort((a: { worker: any; isOvertime: boolean }, b: { worker: any; isOvertime: boolean }) => sortScoreFor(b.worker, b.isOvertime) - sortScoreFor(a.worker, a.isOvertime))[0];

        if (!replacement) {
          unresolved += 1;
          continue;
        }

        const nextRole = replacement.isOvertime ? 'overtime_operator_50' : 'operator';
        const res = await fetch(`/api/worker-assignments/${assignment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ employee_id: replacement.worker.id, role: nextRole }),
        });

        if (!res.ok) {
          unresolved += 1;
          continue;
        }

        reservedWorkerIds.add(replacement.worker.id);
        reservedWorkerIds.delete(currentWorkerId);
        replaced += 1;
      }

      refetchAssignments();
      toast({
        title: 'Reemplazo de conflicto completado',
        description: `Replaced ${replaced} assignments${unresolved ? `, unresolved ${unresolved}` : ''}.`,
      });
    } catch (error: any) {
      toast({ title: 'Falló el reemplazo', description: error.message, variant: 'destructive' });
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleRedistributeOT = async () => {
    if (!selectedShiftId) {
      toast({ title: 'Seleccione primero un turno', variant: 'destructive' });
      return;
    }

    setBulkActionLoading('redistribute-ot');
    try {
      const reservedWorkerIds = new Set<string>(Array.from(selectedShiftAssignedWorkerIds) as string[]);
      let redistributed = 0;
      let remaining = 0;

      const overtimeAssignments = currentShiftAssignments.filter((assignment: any) =>
        String(assignment.role || '').includes('overtime')
      );

      for (const assignment of overtimeAssignments) {
        const station = assignment.workstation;
        const currentWorkerId = assignment.employee_id || assignment.worker_id;

        const replacement = workers
          .filter((worker: any) => !reservedWorkerIds.has(worker.id))
          .filter((worker: any) => !workersAssignedOtherShifts.has(worker.id))
          .map((worker: any): { worker: any; isOvertime: boolean } => ({ worker, isOvertime: false }))
          .filter(({ worker, isOvertime }: { worker: any; isOvertime: boolean }) => isWorkerEligibleForStation(worker, station, isOvertime, workerIndicatorsById?.[worker.id]))
          .sort((a: { worker: any; isOvertime: boolean }, b: { worker: any; isOvertime: boolean }) => sortScoreFor(b.worker, false) - sortScoreFor(a.worker, false))[0];

        if (!replacement) {
          remaining += 1;
          continue;
        }

        const res = await fetch(`/api/worker-assignments/${assignment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ employee_id: replacement.worker.id, role: 'operator' }),
        });

        if (!res.ok) {
          remaining += 1;
          continue;
        }

        reservedWorkerIds.add(replacement.worker.id);
        reservedWorkerIds.delete(currentWorkerId);
        redistributed += 1;
      }

      refetchAssignments();
      toast({
        title: 'Redistribución de OT completada',
        description: `Redistributed ${redistributed} overtime assignments${remaining ? `, remaining ${remaining}` : ''}.`,
      });
    } catch (error: any) {
      toast({ title: 'Falló la redistribución de OT', description: error.message, variant: 'destructive' });
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handlePublishWeek = async () => {
    setPublishLoading(true);
    try {
      const { data: weeklyAssignments, error: assignmentError } = await supabase
        .from('worker_assignments')
        .select('id, employee_id, date, shift:shifts(start_time, end_time)')
        .gte('date', weekStartIso)
        .lte('date', weekEndIso);

      if (assignmentError) throw assignmentError;

      const employeeIds = Array.from(
        new Set((weeklyAssignments || []).map((entry: any) => entry.employee_id).filter(Boolean))
      );

      if (employeeIds.length === 0) {
        toast({
          title: 'Nothing to publish',
          description: 'No existen asignaciones para esta semana.',
          variant: 'destructive',
        });
        setPublishLoading(false);
        return;
      }

      const [{ data: leaveRows, error: leaveError }, { data: contractsRows, error: contractsError }] = await Promise.all([
        supabase
          .from('leave_requests')
          .select('employee_id, leave_type, status, start_date, end_date')
          .in('employee_id', employeeIds)
          .eq('status', 'approved')
          .lte('start_date', weekEndIso)
          .gte('end_date', weekStartIso),
        supabase
          .from('employment_contracts')
          .select('employee_id, contract_start_date, contract_end_date, max_hours_per_week, base_hours_per_week, overtime_allowed, overtime_cap_hours_per_week')
          .in('employee_id', employeeIds)
          .lte('contract_start_date', weekEndIso)
          .or(`contract_end_date.is.null,contract_end_date.gte.${weekStartIso}`),
      ]);

      if (leaveError) throw leaveError;
      if (contractsError) throw contractsError;

      const toMinutes = (timeValue?: string | null) => {
        if (!timeValue) return 0;
        const [hours, minutes] = timeValue.split(':').map(Number);
        return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
      };

      const getShiftHours = (shift: any) => {
        const startMinutes = toMinutes(shift?.start_time);
        const endMinutes = toMinutes(shift?.end_time);
        let durationMinutes = endMinutes - startMinutes;
        if (durationMinutes <= 0) durationMinutes += 24 * 60;
        return durationMinutes / 60;
      };

      const hoursByEmployee: Record<string, number> = {};
      (weeklyAssignments || []).forEach((assignment: any) => {
        const employeeId = assignment.employee_id;
        if (!employeeId) return;
        hoursByEmployee[employeeId] = (hoursByEmployee[employeeId] || 0) + getShiftHours(assignment.shift);
      });

      const contractByEmployee = new Map<string, any>();
      (contractsRows || []).forEach((contract: any) => {
        if (!contract?.employee_id) return;
        if (!contractByEmployee.has(contract.employee_id)) {
          contractByEmployee.set(contract.employee_id, contract);
        }
      });

      const leaveViolationsList: string[] = [];
      (weeklyAssignments || []).forEach((assignment: any) => {
        const overlap = (leaveRows || []).find((leave: any) =>
          leave.employee_id === assignment.employee_id &&
          assignment.date >= leave.start_date &&
          assignment.date <= leave.end_date
        );
        if (overlap) {
          leaveViolationsList.push(`Employee ${assignment.employee_id} assigned on leave (${overlap.leave_type}) at ${assignment.date}`);
        }
      });

      const legalViolationsList: string[] = [];
      employeeIds.forEach((employeeId) => {
        const contract = contractByEmployee.get(employeeId);
        if (!contract) return;
        const totalHours = Number(hoursByEmployee[employeeId] || 0);
        const maxHours = Number(contract.max_hours_per_week || 0);
        const baseHours = Number(contract.base_hours_per_week || 0);
        const overtimeHours = Math.max(0, totalHours - baseHours);
        const overtimeCap = Number(contract.overtime_cap_hours_per_week || 0);

        if (maxHours > 0 && totalHours > maxHours) {
          legalViolationsList.push(`Employee ${employeeId} weekly hours ${totalHours.toFixed(1)} exceed max ${maxHours.toFixed(1)}`);
        }
        if (contract.overtime_allowed === false && overtimeHours > 0) {
          legalViolationsList.push(`Employee ${employeeId} has overtime ${overtimeHours.toFixed(1)} but contract disallows overtime`);
        }
        if (overtimeCap > 0 && overtimeHours > overtimeCap) {
          legalViolationsList.push(`Employee ${employeeId} overtime ${overtimeHours.toFixed(1)} exceeds cap ${overtimeCap.toFixed(1)}`);
        }
      });

      const leaveViolations = leaveViolationsList.length;
      const legalViolations = legalViolationsList.length;
      const details = [...leaveViolationsList.slice(0, 5), ...legalViolationsList.slice(0, 5)];

      setLastWeekValidation({
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
        legalViolations,
        leaveViolations,
        details,
      });

      if (leaveViolations > 0 || legalViolations > 0) {
        toast({
          title: 'Publish blocked by HR validation gate',
          description: `Found ${leaveViolations} leave violation(s) and ${legalViolations} legal violation(s).`,
          variant: 'destructive',
        });
        setPublishLoading(false);
        return;
      }

      const nowIso = new Date().toISOString();
      persistPublishedWeeks({
        ...publishedWeeks,
        [weekStartIso]: nowIso,
      });

      toast({
        title: 'Week published',
        description: `Week ${weekStartIso} to ${weekEndIso} published after HR validation.`,
      });
    } catch (error: any) {
      toast({
        title: 'No se pudo publicar la semana',
        description: error.message || 'Unexpected error during week publishing.',
        variant: 'destructive',
      });
    } finally {
      setPublishLoading(false);
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="px-3 pt-2 pb-3 space-y-2">

        {/* Selected OT Banner */}
        {selectedOT && (
          <SelectedOTBanner ot={selectedOT} onClear={() => setSelectedOT(null)} />
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WorkflowTab)} className="w-full">


          <TabsContent value="layout" className="mt-2">
            {shiftToggleOptions.length > 0 && (
              <div className="flex items-center gap-1.5 mb-3">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Turno:</span>
                {shiftToggleOptions.map((opt) => {
                  const active = opt.ids.includes(selectedShiftId || '');
                  return (
                    <Button
                      key={opt.label}
                      size="sm"
                      onClick={() => setSelectedShiftId(opt.ids[0])}
                      variant={active ? "default" : "outline"}
                      className={`h-6 px-2 text-xs ${active
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                        : "border-border bg-card/50 hover:bg-card"}`}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            )}



            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3">
                <WorkstationLayout
                  workstations={workstations}
                  assignments={assignments}
                  workers={workers}
                  workerIndicatorsById={workerIndicatorsById}
                  monthlyOvertimeByWorker={monthlyOvertimeByWorker}
                  compensationByWorker={compensationByEmployee}
                  shiftHours={shiftHours}
                  costModel={costModel}
                  shiftContext={shiftContext}
                  selectedShift={selectedShiftId || ""}
                  selectedOT={selectedOT}
                  onWorkerSelect={handleWorkerSelect}
                  onUnassignWorker={handleUnassignWorker}
                  onAssignmentChange={refetchAssignments}
                />
              </div>
              <div className="lg:col-span-1 space-y-3">
                {/* Agenda Semanal — sidebar */}
                <AgendaSemanalSidebar
                  weekDates={weekDates}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  weekStartIso={weekStartIso}
                  publishedWeeks={publishedWeeks}
                  lastWeekValidation={lastWeekValidation}
                  onPreviousWeek={goToPreviousWeek}
                  onNextWeek={goToNextWeek}
                  onPublish={handlePublishWeek}
                  publishLoading={publishLoading}
                />

                {/* Weekend shift rotation — two templates rotating weekly */}
                <WeekendShiftRotation workers={workers} weekStart={weekStartDate} />

                {/* Worker Stats */}
                <WorkerStatsPanel
                  selectedWorker={selectedWorker}
                  workers={workers}
                  onWorkerSelect={handleWorkerSelect}
                />

                {/* Bulk Actions */}
                <BulkActionsPanel
                  selectedShiftId={selectedShiftId}
                  bulkActionLoading={bulkActionLoading}
                  onAutoFill={handleBulkAutoFillShift}
                  onReplaceConflicts={handleReplaceConflictedAssignments}
                  onRedistributeOT={handleRedistributeOT}
                />

                {/* Quick Roster */}
                <QuickRosterPanel
                  weekDates={weekDates}
                  selectedDate={selectedDate}
                  selectedShiftId={selectedShiftId}
                  quickSetupLoading={quickSetupLoading}
                  onRepeatLastWeek={handleRepeatLastWeekSetup}
                  onCopyFromDay={handleCopyFromWeekDay}
                />
              </div>
            </div>

            {canManageCostModel && (
              <CostModelPanel costModel={costModel} refetchCostModel={refetchCostModel} />
            )}
          </TabsContent>

        </Tabs>

        <DragOverlay>
          {activeId ? (
            <div className="bg-card/80 rounded p-2 backdrop-blur-sm border border-border">
              <div className="text-foreground font-medium">Dragging...</div>
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
