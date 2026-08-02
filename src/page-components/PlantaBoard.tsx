'use client';

import { useState, useEffect, useMemo } from "react";
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WorkerStatsPanel } from "@/components/workflow/WorkerStatsPanel";
import { WeekendShiftRotation } from "@/components/workflow/WeekendShiftRotation";
const WorkstationLayout = dynamic(() => import('@/components/workflow/WorkstationLayout').then((m) => m.WorkstationLayout));
import { Users, Factory, Clock, ClipboardList, ChevronLeft, ChevronRight, CalendarDays, WandSparkles, Replace, Shuffle, UploadCloud, ShieldAlert, CheckCircle2, Copy, RotateCcw, Printer, LayoutList, FileSpreadsheet, GanttChart, MessageSquare, Monitor } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompensationRatesForDate, useSchedulingCostModel, useWorkerAssignments, useWorkerMonthlyOvertime, useWorkflowCertificationAlerts, useWorkflowContracts, useWorkflowIncentiveStatuses, useWorkflowLeaveStatuses, useWorkflowWeeklyHours, useWorkersByRating, useWorkstations, useShifts } from "@/hooks/use-workflow-queries";
import { useRealtimeProduction } from "@/hooks/use-realtime-production";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { isWorkerQualifiedForStation } from "@/lib/workstation-skills";
import { CerrarDiaDialog } from "@/components/workflow/CerrarDiaDialog";
import { useStationsUnderMaintenance } from "@/hooks/use-maintenance-queries";

type WorkflowTab = 'en_proceso' | 'ots' | 'clients' | 'layout' | 'shifts' | 'production' | 'hoja_prod' | 'plan_semanal' | 'gantt' | 'calendar' | 'whatsapp';

interface PlantaBoardProps {
  /** Retained for compatibility; the board now renders only the planta layout. */
  initialTab?: WorkflowTab;
}

export default function PlantaBoard({ initialTab = 'layout' }: PlantaBoardProps) {
  const router = useRouter();
  useRealtimeProduction();

  const getDateIso = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offset).toISOString().split("T")[0];
  };

  const getWeekStart = (date: Date) => {
    const value = new Date(date);
    const day = value.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    value.setDate(value.getDate() + diff);
    value.setHours(0, 0, 0, 0);
    return value;
  };

  const buildWeekDates = (start: Date) => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  };

  const today = new Date();
  const [activeTab, setActiveTab] = useState<WorkflowTab>(initialTab);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [selectedOT, setSelectedOT] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getDateIso(today));
  const [weekStartDate, setWeekStartDate] = useState<Date>(getWeekStart(today));
  const { data: workersData = [] } = useWorkersByRating();
  const { data: workstationsData = [] } = useWorkstations();
  const { data: shifts = [] } = useShifts();
  const { data: assignments = [], refetch: refetchAssignments } = useWorkerAssignments(selectedDate);
  const { data: monthlyOvertimeByWorker = {} } = useWorkerMonthlyOvertime(selectedDate);
  const { data: stationsUnderMaintenance } = useStationsUnderMaintenance();
  const { data: compensationRates = [] } = useCompensationRatesForDate(selectedDate);
  const { data: workflowLeaveStatuses = [] } = useWorkflowLeaveStatuses(selectedDate);
  const { data: workflowIncentiveStatuses = [] } = useWorkflowIncentiveStatuses(selectedDate);
  const { data: workflowCertificationAlerts = [] } = useWorkflowCertificationAlerts(selectedDate);
  const { data: workflowContracts = [] } = useWorkflowContracts(selectedDate);
  const { data: workflowWeeklyHours = {} } = useWorkflowWeeklyHours(selectedDate);
  const { data: costModel, refetch: refetchCostModel } = useSchedulingCostModel();
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [costModelError, setCostModelError] = useState<string | null>(null);
  const [savingCostModel, setSavingCostModel] = useState(false);
  const [isCostModelExpanded, setIsCostModelExpanded] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState<'auto-fill' | 'replace-conflicts' | 'redistribute-ot' | null>(null);
  const [quickSetupLoading, setQuickSetupLoading] = useState<'copy-day' | 'repeat-last-week' | null>(null);
  const [showQuickRosterGuide, setShowQuickRosterGuide] = useState(false);
  const [quickRosterOpenedOnce, setQuickRosterOpenedOnce] = useState(false);
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

  const defaultCostModel = {
    name: 'Default Cost Model',
    cost_weight: '1',
    rating_weight: '0',
    skill_weight: '0',
    overtime_multiplier_50: '',
    overtime_multiplier_100: '',
    night_shift_multiplier: '',
    weekend_multiplier: '',
    minimum_hourly_rate: '',
    maximum_hourly_rate: '',
    rounding_increment: '0.01',
    prefer_lower_cost: true,
  };

  const [costModelForm, setCostModelForm] = useState(defaultCostModel);
  const COST_MODEL_EXPANDED_STORAGE_KEY = 'workflow_cost_model_expanded';
  const QUICK_ROSTER_GUIDE_SESSION_KEY = 'workflow_quick_roster_guide_seen';

  useEffect(() => {
    const hasSeenGuide = sessionStorage.getItem(QUICK_ROSTER_GUIDE_SESSION_KEY) === '1';
    setShowQuickRosterGuide(!hasSeenGuide);
  }, []);

  useEffect(() => {
    if (!costModel) return;
    setCostModelForm({
      name: costModel.name || 'Cost Model',
      cost_weight: String(costModel.cost_weight ?? '1'),
      rating_weight: String(costModel.rating_weight ?? '0'),
      skill_weight: String(costModel.skill_weight ?? '0'),
      overtime_multiplier_50: costModel.overtime_multiplier_50 === null ? '' : String(costModel.overtime_multiplier_50),
      overtime_multiplier_100: costModel.overtime_multiplier_100 === null ? '' : String(costModel.overtime_multiplier_100),
      night_shift_multiplier: costModel.night_shift_multiplier === null ? '' : String(costModel.night_shift_multiplier),
      weekend_multiplier: costModel.weekend_multiplier === null ? '' : String(costModel.weekend_multiplier),
      minimum_hourly_rate: costModel.minimum_hourly_rate === null ? '' : String(costModel.minimum_hourly_rate),
      maximum_hourly_rate: costModel.maximum_hourly_rate === null ? '' : String(costModel.maximum_hourly_rate),
      rounding_increment: String(costModel.rounding_increment ?? '0.01'),
      prefer_lower_cost: Boolean(costModel.prefer_lower_cost ?? true),
    });
  }, [costModel]);

  useEffect(() => {
    if (!selectedShiftId && shifts.length > 0) {
      setSelectedShiftId(shifts[0].id);
    }
  }, [selectedShiftId, shifts]);

  const handleWorkerSelect = (worker: any) => {
    setSelectedWorker(worker);
  };

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COST_MODEL_EXPANDED_STORAGE_KEY);
      if (!raw) return;
      setIsCostModelExpanded(raw === 'true');
    } catch {
      // ignore local storage errors
    }
  }, [COST_MODEL_EXPANDED_STORAGE_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(COST_MODEL_EXPANDED_STORAGE_KEY, String(isCostModelExpanded));
    } catch {
      // ignore local storage errors
    }
  }, [isCostModelExpanded, COST_MODEL_EXPANDED_STORAGE_KEY]);

  const weekDates = buildWeekDates(weekStartDate);
  const weekStartIso = getDateIso(weekStartDate);
  const weekEndIso = getDateIso(new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 6));

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
      const sourceDate = getDateIso(date);
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

  const toNumberOrNull = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const handleSaveCostModel = async () => {
    setSavingCostModel(true);
    setCostModelError(null);

    const payload = {
      name: costModelForm.name || 'Cost Model',
      is_active: true,
      cost_weight: Number(costModelForm.cost_weight || 0),
      rating_weight: Number(costModelForm.rating_weight || 0),
      skill_weight: Number(costModelForm.skill_weight || 0),
      overtime_multiplier_50: toNumberOrNull(costModelForm.overtime_multiplier_50),
      overtime_multiplier_100: toNumberOrNull(costModelForm.overtime_multiplier_100),
      night_shift_multiplier: toNumberOrNull(costModelForm.night_shift_multiplier),
      weekend_multiplier: toNumberOrNull(costModelForm.weekend_multiplier),
      minimum_hourly_rate: toNumberOrNull(costModelForm.minimum_hourly_rate),
      maximum_hourly_rate: toNumberOrNull(costModelForm.maximum_hourly_rate),
      rounding_increment: Number(costModelForm.rounding_increment || 0.01),
      prefer_lower_cost: Boolean(costModelForm.prefer_lower_cost),
    };

    try {
      // Through the API, not browser-direct: RLS silently rejected these writes
      // under dev-bypass, so the model looked saved and never was.
      const res = costModel?.id
        ? await fetch(`/api/scheduling-cost-models?id=${encodeURIComponent(costModel.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          })
        : await fetch('/api/scheduling-cost-models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo guardar el modelo de costos');
      }

      toast({
        title: 'Modelo de costos guardado',
        description: 'La programación usará la configuración actualizada del modelo de costos.',
      });
      refetchCostModel();
    } catch (error: any) {
      setCostModelError(error.message || 'No se pudo guardar el modelo de costos');
      toast({
        title: 'No se pudo guardar el modelo de costos',
        description: error.message || 'Revisa los valores e intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSavingCostModel(false);
    }
  };

  const calendarLocale = 'es-CL';

  const formatWeekday = (date: Date) =>
    date.toLocaleDateString(calendarLocale, { weekday: "short" });

  const formatDayLabel = (date: Date) =>
    date.toLocaleDateString(calendarLocale, { day: "2-digit", month: "2-digit" });

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleUnassignWorker = async (assignmentId?: string, workerName?: string) => {
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
  };

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
    const currentAssignments = shiftAssignments.filter(a => a.workstation_id === workstation.id);
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

  const getWorkerConflictFlags = (workerId?: string | null, station?: any, isOvertime = false) => {
    if (!workerId) {
      return { leaveConflict: true, legalConflict: true, missingSkill: false };
    }
    const indicators = workerIndicatorsById?.[workerId] || {};
    const worker = workers.find((entry: any) => entry.id === workerId);

    const leaveConflict = indicators.leaveTone === 'alert';
    const legalConflict = Boolean(indicators.legalHourConflict);
    const missingSkill = station ? !isWorkerQualifiedForStation(worker, station) : false;

    return { leaveConflict, legalConflict, missingSkill };
  };

  const isWorkerEligibleForStation = (worker: any, station: any, isOvertime: boolean) => {
    const conflicts = getWorkerConflictFlags(worker?.id, station, isOvertime);
    if (conflicts.leaveConflict || conflicts.legalConflict || conflicts.missingSkill) {
      return false;
    }
    if (isOvertime && !worker?.overtime_availability) {
      return false;
    }
    return true;
  };

  const getWorkerSortScore = (worker: any, station: any, isOvertime: boolean) => {
    const costRate = Number(compensationByEmployee?.[worker?.id]?.hourly_rate || 0);
    const rating = Number(worker?.overall_rating || 0);
    const overtimePenalty = isOvertime ? 10 : 0;
    return rating * 2 - costRate * 0.05 - overtimePenalty;
  };

  const handleBulkAutoFillShift = async () => {
    if (!selectedShiftId) {
      toast({ title: 'Seleccione primero un turno', variant: 'destructive' });
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
        const stationAssignments = currentShiftAssignments.filter((assignment: any) => assignment.workstation_id === station.id);
        const capacityLeft = Math.max(0, Number(station.max_workers || 0) - stationAssignments.length);
        if (capacityLeft <= 0) continue;

        const candidates = workers
          .filter((worker: any) => !reservedWorkerIds.has(worker.id))
          .map((worker: any): { worker: any; isOvertime: boolean } => {
            const isOvertime = workersAssignedOtherShifts.has(worker.id);
            return { worker, isOvertime };
          })
          .filter(({ worker, isOvertime }: { worker: any; isOvertime: boolean }) => isWorkerEligibleForStation(worker, station, isOvertime))
          .sort((a: { worker: any; isOvertime: boolean }, b: { worker: any; isOvertime: boolean }) => getWorkerSortScore(b.worker, station, b.isOvertime) - getWorkerSortScore(a.worker, station, a.isOvertime));

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
        const isOvertime = String(assignment.role || '').includes('overtime');
        const conflicts = getWorkerConflictFlags(workerId, assignment.workstation, isOvertime);
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
          .filter(({ worker, isOvertime }: { worker: any; isOvertime: boolean }) => isWorkerEligibleForStation(worker, station, isOvertime))
          .sort((a: { worker: any; isOvertime: boolean }, b: { worker: any; isOvertime: boolean }) => getWorkerSortScore(b.worker, station, b.isOvertime) - getWorkerSortScore(a.worker, station, a.isOvertime))[0];

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
          .filter(({ worker, isOvertime }: { worker: any; isOvertime: boolean }) => isWorkerEligibleForStation(worker, station, isOvertime))
          .sort((a: { worker: any; isOvertime: boolean }, b: { worker: any; isOvertime: boolean }) => getWorkerSortScore(b.worker, station, false) - getWorkerSortScore(a.worker, station, false))[0];

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
          <Card 
            className="bg-card border-accent/40 backdrop-blur-sm p-4 mb-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">OT Activa: {selectedOT.ot_number}</h3>
                <p className="text-sm text-muted-foreground">{selectedOT.client_name} — {selectedOT.quantity} unidades</p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedOT(null)}
                className="border-border bg-card/50 hover:bg-card"
              >
                Limpiar
              </Button>
            </div>
          </Card>
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
                <Card className="bg-card/80 border-border backdrop-blur-sm p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">Agenda</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" onClick={goToPreviousWeek} className="h-6 w-6 border-border bg-card/50 hover:bg-card">
                        <ChevronLeft className="w-3 h-3" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-6 w-6 border-border bg-card/50 hover:bg-card">
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                      <Button size="sm" onClick={handlePublishWeek} disabled={publishLoading} className="h-6 px-2 text-[10px]">
                        <UploadCloud className="w-3 h-3 mr-1" />
                        {publishLoading ? '...' : 'Publicar'}
                      </Button>
                      {/* Turns the day's clock marks into real labour cost on each OT. */}
                      <CerrarDiaDialog date={selectedDate} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mb-2">
                    {weekDates.map((date) => {
                      const dateIso = getDateIso(date);
                      const isSelected = dateIso === selectedDate;
                      const isToday = dateIso === getDateIso(new Date());
                      return (
                        <button
                          key={dateIso}
                          onClick={() => setSelectedDate(dateIso)}
                          className={`rounded px-1 py-1.5 text-center text-[10px] leading-tight transition-colors ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          <div className="font-medium uppercase">{formatWeekday(date)}</div>
                          <div className={isToday ? 'font-bold' : ''}>{formatDayLabel(date)}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] mb-1">
                    {publishedWeeks[weekStartIso] ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" />
                        Publicado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <ShieldAlert className="w-3 h-3" />
                        Sin publicar
                      </span>
                    )}
                  </div>
                  {lastWeekValidation && lastWeekValidation.weekStart === weekStartIso && (
                    <div className={`rounded p-1.5 text-[10px] ${
                      lastWeekValidation.legalViolations > 0 || lastWeekValidation.leaveViolations > 0
                        ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'
                    }`}>
                      {lastWeekValidation.leaveViolations} ausencias · {lastWeekValidation.legalViolations} legales
                    </div>
                  )}
                </Card>

                {/* Weekend shift rotation — two templates rotating weekly */}
                <WeekendShiftRotation workers={workers} weekStart={weekStartDate} />

                {/* Worker Stats */}
                <WorkerStatsPanel
                  selectedWorker={selectedWorker}
                  workers={workers}
                  onWorkerSelect={handleWorkerSelect}
                />

                {/* Bulk Actions */}
                <Card className="bg-card/80 border-border backdrop-blur-sm p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Acciones masivas</p>
                  <div className="space-y-1.5">
                    <Button onClick={handleBulkAutoFillShift} disabled={!selectedShiftId || bulkActionLoading !== null} size="sm" className="w-full h-7 text-xs justify-start">
                      <WandSparkles className="w-3.5 h-3.5 mr-1.5" />
                      {bulkActionLoading === 'auto-fill' ? 'Asignando...' : 'Auto-fill por restricciones'}
                    </Button>
                    <Button onClick={handleReplaceConflictedAssignments} disabled={!selectedShiftId || bulkActionLoading !== null} variant="outline" size="sm" className="w-full h-7 text-xs justify-start border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
                      <Replace className="w-3.5 h-3.5 mr-1.5" />
                      {bulkActionLoading === 'replace-conflicts' ? 'Reemplazando...' : 'Reemplazar conflictos'}
                    </Button>
                    <Button onClick={handleRedistributeOT} disabled={!selectedShiftId || bulkActionLoading !== null} variant="outline" size="sm" className="w-full h-7 text-xs justify-start border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
                      <Shuffle className="w-3.5 h-3.5 mr-1.5" />
                      {bulkActionLoading === 'redistribute-ot' ? 'Redistributing...' : 'Redistribuir HE'}
                    </Button>
                  </div>
                </Card>

                {/* Quick Roster */}
                {showQuickRosterGuide && (
                  <details
                    className="group"
                    onToggle={(event) => {
                      const isOpen = (event.currentTarget as HTMLDetailsElement).open;
                      if (isOpen) {
                        setQuickRosterOpenedOnce(true);
                        return;
                      }
                      if (quickRosterOpenedOnce) {
                        sessionStorage.setItem(QUICK_ROSTER_GUIDE_SESSION_KEY, '1');
                        setShowQuickRosterGuide(false);
                      }
                    }}
                  >
                    <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 list-none">
                      <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90 shrink-0" />
                      Configuración rápida
                    </summary>
                    <div className="mt-2 rounded-md border border-border p-3 bg-card/40 space-y-2">
                      <Button variant="outline" size="sm" onClick={handleRepeatLastWeekSetup} disabled={!selectedShiftId || quickSetupLoading !== null} className="w-full h-7 text-xs">
                        <RotateCcw className="w-3 h-3 mr-1" />
                        {quickSetupLoading === 'repeat-last-week' ? 'Aplicando...' : 'Repetir semana anterior'}
                      </Button>
                      <div className="flex flex-wrap gap-1">
                        {weekDates.map((date) => getDateIso(date)).filter((d) => d !== selectedDate).map((dateIso) => (
                          <Button key={`copy-${dateIso}`} variant="outline" size="sm" disabled={!selectedShiftId || quickSetupLoading !== null} onClick={() => handleCopyFromWeekDay(dateIso)} className="h-6 px-2 text-[10px]">
                            <Copy className="w-2.5 h-2.5 mr-0.5" />
                            {dateIso}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </details>
                )}
              </div>
            </div>

            {canManageCostModel && (
              <Card className="bg-card/80 border-border backdrop-blur-sm p-4 mt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Modelo de costos</h3>
                    <p className="text-sm text-muted-foreground">
                      Customize how cost, rating, and skill weights rank assignments.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCostModelExpanded((prev) => !prev)}
                    className="border-border bg-card/50 hover:bg-card"
                  >
                    {isCostModelExpanded ? 'Collapse' : 'Expand'}
                  </Button>
                </div>

                {isCostModelExpanded && (
                  <div className="mt-4 max-h-[50vh] overflow-y-auto pr-1">
                    <div className="flex items-center justify-end mb-4">
                      <Button
                        onClick={handleSaveCostModel}
                        disabled={savingCostModel}
                        className="bg-primary hover:bg-primary/90"
                      >
                        {savingCostModel ? 'Saving...' : 'Save Cost Model'}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="cost-model-name">Nombre del modelo</Label>
                        <Input
                          id="cost-model-name"
                          value={costModelForm.name}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="cost-weight">Peso del costo</Label>
                        <Input
                          id="cost-weight"
                          type="number"
                          step="0.1"
                          value={costModelForm.cost_weight}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, cost_weight: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="rating-weight">Peso de la calificación</Label>
                        <Input
                          id="rating-weight"
                          type="number"
                          step="0.1"
                          value={costModelForm.rating_weight}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, rating_weight: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="skill-weight">Peso de la habilidad</Label>
                        <Input
                          id="skill-weight"
                          type="number"
                          step="0.1"
                          value={costModelForm.skill_weight}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, skill_weight: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="ot-multiplier">OT 50% Multiplier</Label>
                        <Input
                          id="ot-multiplier"
                          type="number"
                          step="0.01"
                          value={costModelForm.overtime_multiplier_50}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, overtime_multiplier_50: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="ot-multiplier-100">OT 100% Multiplier</Label>
                        <Input
                          id="ot-multiplier-100"
                          type="number"
                          step="0.01"
                          value={costModelForm.overtime_multiplier_100}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, overtime_multiplier_100: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="night-multiplier">Night Shift Multiplier</Label>
                        <Input
                          id="night-multiplier"
                          type="number"
                          step="0.01"
                          value={costModelForm.night_shift_multiplier}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, night_shift_multiplier: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="weekend-multiplier">Weekend Multiplier</Label>
                        <Input
                          id="weekend-multiplier"
                          type="number"
                          step="0.01"
                          value={costModelForm.weekend_multiplier}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, weekend_multiplier: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="min-rate">Tarifa mínima por hora</Label>
                        <Input
                          id="min-rate"
                          type="number"
                          step="0.01"
                          value={costModelForm.minimum_hourly_rate}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, minimum_hourly_rate: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="max-rate">Maximum Hourly Rate</Label>
                        <Input
                          id="max-rate"
                          type="number"
                          step="0.01"
                          value={costModelForm.maximum_hourly_rate}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, maximum_hourly_rate: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="rounding">Rounding Increment</Label>
                        <Input
                          id="rounding"
                          type="number"
                          step="0.01"
                          value={costModelForm.rounding_increment}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, rounding_increment: event.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={costModelForm.prefer_lower_cost}
                          onCheckedChange={(checked) =>
                            setCostModelForm((prev) => ({ ...prev, prefer_lower_cost: checked }))
                          }
                        />
                        <Label>Preferir menor costo</Label>
                      </div>
                      {costModelError && (
                        <p className="text-sm text-destructive">{costModelError}</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
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