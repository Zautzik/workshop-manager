'use client';

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkstationLayout } from "@/components/workflow/WorkstationLayout";
import { WorkerStatsPanel } from "@/components/workflow/WorkerStatsPanel";
import { ShiftManagement } from "@/components/workflow/ShiftManagement";
import { OTManagement } from "@/components/workflow/OTManagement";
import OTRetrievalSystem from "@/components/workflow/OTRetrievalSystem";
import { ClientManager } from "@/components/workflow/ClientManager";
import { OrdenesEnProceso } from "@/components/workflow/OrdenesEnProceso";
import { Users, Factory, Clock, ClipboardList, ChevronLeft, ChevronRight, CalendarDays, WandSparkles, Replace, Shuffle, UploadCloud, ShieldAlert, CheckCircle2, Copy, RotateCcw, Printer, LayoutList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompensationRatesForDate, useSchedulingCostModel, useWorkerAssignments, useWorkerMonthlyOvertime, useWorkflowCertificationAlerts, useWorkflowContracts, useWorkflowIncentiveStatuses, useWorkflowLeaveStatuses, useWorkflowWeeklyHours, useWorkersByRating, useWorkstations, useShifts } from "@/hooks/use-queries";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { isWorkerQualifiedForStation } from "@/lib/workstation-skills";

export default function WorkflowDashboard() {
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
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [selectedOT, setSelectedOT] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getDateIso(today));
  const [weekStartDate, setWeekStartDate] = useState<Date>(getWeekStart(today));
  const { data: workers = [] } = useWorkersByRating();
  const { data: workstations = [] } = useWorkstations();
  const { data: shifts = [] } = useShifts();
  const { data: assignments = [], refetch: refetchAssignments } = useWorkerAssignments(selectedDate);
  const { data: monthlyOvertimeByWorker = {} } = useWorkerMonthlyOvertime(selectedDate);
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
  const { t } = useTranslation();

  const canManageCostModel = role === 'admin';

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
        title: 'Select a shift first',
        description: 'Choose a shift before applying a quick roster setup.',
        variant: 'destructive',
      });
      return;
    }

    if (sourceDate === selectedDate) {
      toast({
        title: 'Source and target are the same day',
        description: 'Pick another day to copy roster setup from.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: sourceAssignments, error: sourceError } = await supabase
        .from('worker_assignments')
        .select('employee_id, worker_id, workstation_id, role, ot_id')
        .eq('date', sourceDate)
        .eq('shift_id', selectedShiftId);

      if (sourceError) throw sourceError;

      if (!sourceAssignments || sourceAssignments.length === 0) {
        toast({
          title: 'No source roster found',
          description: `No assignments exist for ${setupLabel}.`,
          variant: 'destructive',
        });
        return;
      }

      const { error: deleteError } = await supabase
        .from('worker_assignments')
        .delete()
        .eq('date', selectedDate)
        .eq('shift_id', selectedShiftId);

      if (deleteError) throw deleteError;

      const payload = sourceAssignments.map((assignment: any) => ({
        employee_id: assignment.employee_id,
        worker_id: assignment.worker_id,
        workstation_id: assignment.workstation_id,
        shift_id: selectedShiftId,
        date: selectedDate,
        role: assignment.role,
        ot_id: selectedOT?.id || assignment.ot_id || null,
      }));

      const { error: insertError } = await supabase
        .from('worker_assignments')
        .insert(payload);

      if (insertError) throw insertError;

      refetchAssignments();
      toast({
        title: 'Quick roster setup applied',
        description: `Copied ${payload.length} assignments from ${setupLabel}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Failed to apply quick setup',
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
      const response = costModel?.id
        ? await supabase
            .from('scheduling_cost_models')
            .update(payload)
            .eq('id', costModel.id)
        : await supabase
            .from('scheduling_cost_models')
            .insert(payload);

      if (response.error) throw response.error;

      toast({
        title: 'Cost model saved',
        description: 'Scheduling will use the updated cost model settings.',
      });
      refetchCostModel();
    } catch (error: any) {
      setCostModelError(error.message || 'Failed to save cost model');
      toast({
        title: 'Failed to save cost model',
        description: error.message || 'Please review the values and try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingCostModel(false);
    }
  };

  const formatWeekday = (date: Date) =>
    date.toLocaleDateString(undefined, { weekday: "short" });

  const formatDayLabel = (date: Date) =>
    date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleUnassignWorker = async (assignmentId?: string, workerName?: string) => {
    if (!assignmentId) return;

    try {
      const { error } = await supabase
        .from("worker_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;

      toast({
        title: "Worker unassigned",
        description: `${workerName || "Worker"} was removed from this shift assignment.`
      });

      refetchAssignments();
    } catch (error: any) {
      toast({
        title: "Error unassigning worker",
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
        title: "Select a shift first",
        description: "Choose a shift in the Layout settings before assigning workers.",
        variant: "destructive"
      });
      return;
    }

    if (!isWorkerQualifiedForStation(worker, workstation)) {
      const workerName = worker?.name || worker?.full_name || 'This worker';
      toast({
        title: "Skill requirement not met",
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
        title: "Overtime not available",
        description: `${worker.name} is already assigned in another shift and is not marked as overtime available.`,
        variant: "destructive"
      });
      return;
    }

    const assignmentRole = isOvertimeAssignment ? "overtime_operator_50" : "operator";

    try {
      if (assignmentId) {
        const draggedAssignment = assignments.find(a => a.id === assignmentId);

        const { error } = await supabase
          .from("worker_assignments")
          .update({
            workstation_id: workstation.id,
            ot_id: selectedOT?.id || null,
            role: draggedAssignment?.role || assignmentRole,
          })
          .eq("id", assignmentId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("worker_assignments")
          .insert({
            employee_id: worker.id,
            workstation_id: workstation.id,
            shift_id: selectedShiftId,
            date: selectedDate,
            role: assignmentRole,
            ot_id: selectedOT?.id || null
          });
        if (error) throw error;
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
        title: "Error assigning worker",
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
      toast({ title: 'Select a shift first', variant: 'destructive' });
      return;
    }

    setBulkActionLoading('auto-fill');
    try {
      const reservedWorkerIds = new Set<string>(Array.from(selectedShiftAssignedWorkerIds) as string[]);
      let inserted = 0;
      let skipped = 0;

      for (const station of workstations) {
        const stationAssignments = currentShiftAssignments.filter((assignment: any) => assignment.workstation_id === station.id);
        const capacityLeft = Math.max(0, Number(station.max_workers || 0) - stationAssignments.length);
        if (capacityLeft <= 0) continue;

        const candidates = workers
          .filter((worker: any) => !reservedWorkerIds.has(worker.id))
          .map((worker: any) => {
            const isOvertime = workersAssignedOtherShifts.has(worker.id);
            return { worker, isOvertime };
          })
          .filter(({ worker, isOvertime }) => isWorkerEligibleForStation(worker, station, isOvertime))
          .sort((a, b) => getWorkerSortScore(b.worker, station, b.isOvertime) - getWorkerSortScore(a.worker, station, a.isOvertime));

        for (const candidate of candidates.slice(0, capacityLeft)) {
          const role = candidate.isOvertime ? 'overtime_operator_50' : 'operator';
          const { error } = await supabase.from('worker_assignments').insert({
            employee_id: candidate.worker.id,
            workstation_id: station.id,
            shift_id: selectedShiftId,
            date: selectedDate,
            role,
            ot_id: selectedOT?.id || null,
          });

          if (error) {
            skipped += 1;
            continue;
          }
          reservedWorkerIds.add(candidate.worker.id);
          inserted += 1;
        }
      }

      refetchAssignments();
      toast({
        title: 'Auto-fill completed',
        description: `Assigned ${inserted} workers${skipped ? `, skipped ${skipped}` : ''}.`,
      });
    } catch (error: any) {
      toast({ title: 'Auto-fill failed', description: error.message, variant: 'destructive' });
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleReplaceConflictedAssignments = async () => {
    if (!selectedShiftId) {
      toast({ title: 'Select a shift first', variant: 'destructive' });
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
          .map((worker: any) => {
            const isOvertime = workersAssignedOtherShifts.has(worker.id);
            return { worker, isOvertime };
          })
          .filter(({ worker, isOvertime }) => isWorkerEligibleForStation(worker, station, isOvertime))
          .sort((a, b) => getWorkerSortScore(b.worker, station, b.isOvertime) - getWorkerSortScore(a.worker, station, a.isOvertime))[0];

        if (!replacement) {
          unresolved += 1;
          continue;
        }

        const nextRole = replacement.isOvertime ? 'overtime_operator_50' : 'operator';
        const { error } = await supabase
          .from('worker_assignments')
          .update({ employee_id: replacement.worker.id, role: nextRole })
          .eq('id', assignment.id);

        if (error) {
          unresolved += 1;
          continue;
        }

        reservedWorkerIds.add(replacement.worker.id);
        reservedWorkerIds.delete(currentWorkerId);
        replaced += 1;
      }

      refetchAssignments();
      toast({
        title: 'Conflict replacement completed',
        description: `Replaced ${replaced} assignments${unresolved ? `, unresolved ${unresolved}` : ''}.`,
      });
    } catch (error: any) {
      toast({ title: 'Replacement failed', description: error.message, variant: 'destructive' });
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleRedistributeOT = async () => {
    if (!selectedShiftId) {
      toast({ title: 'Select a shift first', variant: 'destructive' });
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
          .map((worker: any) => ({ worker, isOvertime: false }))
          .filter(({ worker, isOvertime }) => isWorkerEligibleForStation(worker, station, isOvertime))
          .sort((a, b) => getWorkerSortScore(b.worker, station, false) - getWorkerSortScore(a.worker, station, false))[0];

        if (!replacement) {
          remaining += 1;
          continue;
        }

        const { error } = await supabase
          .from('worker_assignments')
          .update({ employee_id: replacement.worker.id, role: 'operator' })
          .eq('id', assignment.id);

        if (error) {
          remaining += 1;
          continue;
        }

        reservedWorkerIds.add(replacement.worker.id);
        reservedWorkerIds.delete(currentWorkerId);
        redistributed += 1;
      }

      refetchAssignments();
      toast({
        title: 'OT redistribution completed',
        description: `Redistributed ${redistributed} overtime assignments${remaining ? `, remaining ${remaining}` : ''}.`,
      });
    } catch (error: any) {
      toast({ title: 'OT redistribution failed', description: error.message, variant: 'destructive' });
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
          description: 'No assignments exist for this week.',
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
        title: 'Failed to publish week',
        description: error.message || 'Unexpected error during week publishing.',
        variant: 'destructive',
      });
    } finally {
      setPublishLoading(false);
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('workflow.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {workers.length} operarios · {workstations.length} estaciones
            </p>
          </div>
        </div>

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
        <Tabs defaultValue="en_proceso" className="w-full">
          <TabsList className="bg-card/80 border-border backdrop-blur-sm">
            <TabsTrigger value="en_proceso" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
              <LayoutList className="w-4 h-4" />
              En Proceso
            </TabsTrigger>
            <TabsTrigger value="ots" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
              <ClipboardList className="w-4 h-4" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="clients" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
              <Users className="w-4 h-4" />
              Clientes
            </TabsTrigger>
            <TabsTrigger value="layout" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
              <Factory className="w-4 h-4" />
              Planta
            </TabsTrigger>
            <TabsTrigger value="shifts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
              <Clock className="w-4 h-4" />
              Turnos
            </TabsTrigger>
            <TabsTrigger value="production" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
              <Printer className="w-4 h-4" />
              Archivo OT
            </TabsTrigger>
          </TabsList>

          <TabsContent value="en_proceso" className="mt-4">
            <OrdenesEnProceso />
          </TabsContent>

          <TabsContent value="ots" className="mt-4">
            <OTManagement onOTSelect={setSelectedOT} />
          </TabsContent>

          <TabsContent value="clients" className="mt-4">
            <ClientManager />
          </TabsContent>

          <TabsContent value="layout" className="mt-4">

            {/* Shift Selection */}
            <Card className="bg-card/80 border-border backdrop-blur-sm p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-foreground" />
                  <h3 className="text-lg font-bold text-foreground">Seleccionar Turno</h3>
                </div>
                {shifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay turnos configurados.</p>
                ) : (
                  <div className="flex gap-2 flex-wrap justify-end">
                    {shifts.map((shift) => (
                      <Button
                        key={shift.id}
                        onClick={() => setSelectedShiftId(shift.id)}
                        variant={selectedShiftId === shift.id ? "default" : "outline"}
                        className={selectedShiftId === shift.id 
                          ? "bg-primary hover:bg-primary/90 text-primary-foreground" 
                          : "border-border bg-card/50 hover:bg-card"}
                      >
                        {shift.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card className="bg-card/80 border-border backdrop-blur-sm p-4 mb-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-foreground" />
                    <h3 className="text-lg font-bold text-foreground">Agenda Semanal</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePublishWeek}
                      disabled={publishLoading}
                      className="border-border bg-card/50 hover:bg-card"
                    >
                      <UploadCloud className="w-4 h-4 mr-2" />
                      {publishLoading ? 'Validating...' : 'Publish Week'}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={goToPreviousWeek}
                      className="border-border bg-card/50 hover:bg-card h-8 w-8"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={goToNextWeek}
                      className="border-border bg-card/50 hover:bg-card h-8 w-8"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {weekDates.map((date) => {
                    const dateIso = getDateIso(date);
                    const isSelected = dateIso === selectedDate;
                    const isToday = dateIso === getDateIso(new Date());

                    return (
                      <Button
                        key={dateIso}
                        onClick={() => setSelectedDate(dateIso)}
                        variant={isSelected ? "default" : "outline"}
                        className={isSelected
                          ? "h-auto py-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                          : "h-auto py-2 border-border bg-card/50 hover:bg-card"
                        }
                      >
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs opacity-80">{formatWeekday(date)}</span>
                          <span className="text-sm font-semibold">{formatDayLabel(date)}</span>
                          {isToday && <span className="text-[10px]">Today</span>}
                        </div>
                      </Button>
                    );
                  })}
                </div>

                <div className="rounded-md border border-border p-3 bg-card/40">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <p className="text-xs font-medium text-foreground">Quick roster setups</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRepeatLastWeekSetup}
                      disabled={!selectedShiftId || quickSetupLoading !== null}
                      className="h-7 border-border bg-card/50 hover:bg-card"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {quickSetupLoading === 'repeat-last-week' ? 'Applying...' : 'Repeat last week'}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {weekDates
                      .map((date) => getDateIso(date))
                      .filter((dateIso) => dateIso !== selectedDate)
                      .map((dateIso) => (
                        <Button
                          key={`copy-${dateIso}`}
                          variant="outline"
                          size="sm"
                          disabled={!selectedShiftId || quickSetupLoading !== null}
                          onClick={() => handleCopyFromWeekDay(dateIso)}
                          className="h-7 border-border bg-card/50 hover:bg-card"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy {dateIso}
                        </Button>
                      ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {publishedWeeks[weekStartIso] ? (
                    <div className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                      Published: {new Date(publishedWeeks[weekStartIso]).toLocaleString()}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 text-muted-foreground">
                      <ShieldAlert className="w-4 h-4" />
                      Not published for this week yet
                    </div>
                  )}
                </div>

                {lastWeekValidation && lastWeekValidation.weekStart === weekStartIso && (
                  <div
                    className={`rounded-md border p-3 text-sm ${
                      lastWeekValidation.legalViolations > 0 || lastWeekValidation.leaveViolations > 0
                        ? 'border-destructive/40 bg-destructive/5'
                        : 'border-emerald-500/30 bg-emerald-500/5'
                    }`}
                  >
                    <p className="font-semibold text-foreground">
                      HR validation: leave violations {lastWeekValidation.leaveViolations}, legal violations {lastWeekValidation.legalViolations}
                    </p>
                    {lastWeekValidation.details.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {lastWeekValidation.details.map((item, index) => (
                          <li key={`validation-${index}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <Card className="bg-card/80 border-border backdrop-blur-sm p-4 mb-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">Bulk Planning Actions</h3>
                  <p className="text-xs text-muted-foreground">Applies constraints, conflicts, and OT rules</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleBulkAutoFillShift}
                    disabled={!selectedShiftId || bulkActionLoading !== null}
                    variant="outline"
                    className="border-border bg-card/50 hover:bg-card"
                  >
                    <WandSparkles className="w-4 h-4 mr-2" />
                    {bulkActionLoading === 'auto-fill' ? 'Auto-filling...' : 'Auto-fill shift by constraints'}
                  </Button>
                  <Button
                    onClick={handleReplaceConflictedAssignments}
                    disabled={!selectedShiftId || bulkActionLoading !== null}
                    variant="outline"
                    className="border-border bg-card/50 hover:bg-card"
                  >
                    <Replace className="w-4 h-4 mr-2" />
                    {bulkActionLoading === 'replace-conflicts' ? 'Replacing...' : 'Replace conflicted assignments'}
                  </Button>
                  <Button
                    onClick={handleRedistributeOT}
                    disabled={!selectedShiftId || bulkActionLoading !== null}
                    variant="outline"
                    className="border-border bg-card/50 hover:bg-card"
                  >
                    <Shuffle className="w-4 h-4 mr-2" />
                    {bulkActionLoading === 'redistribute-ot' ? 'Redistributing...' : 'Redistribute OT'}
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
              <div className="lg:col-span-1">
                <WorkerStatsPanel
                  selectedWorker={selectedWorker}
                  workers={workers}
                  onWorkerSelect={handleWorkerSelect}
                />
              </div>
            </div>

            {canManageCostModel && (
              <Card className="bg-card/80 border-border backdrop-blur-sm p-4 mt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Cost Model</h3>
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
                        <Label htmlFor="cost-model-name">Model Name</Label>
                        <Input
                          id="cost-model-name"
                          value={costModelForm.name}
                          onChange={(event) =>
                            setCostModelForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="cost-weight">Cost Weight</Label>
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
                        <Label htmlFor="rating-weight">Rating Weight</Label>
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
                        <Label htmlFor="skill-weight">Skill Weight</Label>
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
                        <Label htmlFor="min-rate">Minimum Hourly Rate</Label>
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
                        <Label>Prefer lower cost</Label>
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

          <TabsContent value="shifts" className="mt-4">
            <ShiftManagement onShiftChange={() => refetchAssignments()} />
          </TabsContent>

          <TabsContent value="production" className="mt-4">
            <OTRetrievalSystem />
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