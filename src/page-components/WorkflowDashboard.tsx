'use client';

import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkstationLayout } from "@/components/workflow/WorkstationLayout";
import { WorkerStatsPanel } from "@/components/workflow/WorkerStatsPanel";
import { ShiftManagement } from "@/components/workflow/ShiftManagement";
import { OTManagement } from "@/components/workflow/OTManagement";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Users, Factory, Clock, BarChart3, ClipboardList, ArrowLeft, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkerAssignments, useWorkerMonthlyOvertime, useWorkersByRating, useWorkstations, useShifts } from "@/hooks/use-queries";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";

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
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { toast } = useToast();
  const { role } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const handleBackToDashboard = () => {
    const dashboardRoutes: Record<string, string> = {
      supervisor: '/supervisor',
      manager: '/manager',
      admin: '/admin'
    };
    router.push(dashboardRoutes[role || 'supervisor']);
  };

  useEffect(() => {
    if (!selectedShiftId && shifts.length > 0) {
      setSelectedShiftId(shifts[0].id);
    }
  }, [selectedShiftId, shifts]);

  const handleWorkerSelect = (worker: any) => {
    setSelectedWorker(worker);
  };

  const weekDates = buildWeekDates(weekStartDate);

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

  const formatWeekday = (date: Date) =>
    date.toLocaleDateString(undefined, { weekday: "short" });

  const formatDayLabel = (date: Date) =>
    date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
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
      if (!assignmentId) {
        return;
      }

      try {
        const { error } = await supabase
          .from("worker_assignments")
          .delete()
          .eq("id", assignmentId);

        if (error) throw error;

        toast({
          title: "Worker unassigned",
          description: `${worker.name} was removed from this shift assignment.`
        });

        refetchAssignments();
      } catch (error: any) {
        toast({
          title: "Error unassigning worker",
          description: error.message,
          variant: "destructive"
        });
      }

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

    const workerAssignmentsToday = assignments.filter(a => a.worker_id === worker.id);
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
            worker_id: worker.id,
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

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/10 to-background p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleBackToDashboard}
              variant="outline"
              size="sm"
              className="border-border bg-card/50 hover:bg-card"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">{t('workflow.title')}</h1>
              <p className="text-muted-foreground">Dynamic Workflow & Performance Tracking</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <LanguageSwitcher />
            <Card className="bg-card/80 border-border backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-foreground">
                <Users className="w-5 h-5" />
                <span className="text-sm">{workers.length} Workers</span>
              </div>
            </Card>
            <Card className="bg-card/80 border-border backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-foreground">
                <Factory className="w-5 h-5" />
                <span className="text-sm">{workstations.length} Stations</span>
              </div>
            </Card>
          </div>
        </div>

        {/* Selected OT Banner */}
        {selectedOT && (
          <Card 
            className="bg-card border-accent/40 backdrop-blur-sm p-4 mb-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">Active OT: {selectedOT.ot_number}</h3>
                <p className="text-sm text-muted-foreground">{selectedOT.client_name} - {selectedOT.quantity} units</p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedOT(null)}
                className="border-border bg-card/50 hover:bg-card"
              >
                Clear Selection
              </Button>
            </div>
          </Card>
        )}

        {/* Main Content */}
        <Tabs defaultValue="ots" className="w-full">
          <TabsList className="bg-card/80 border-border backdrop-blur-sm">
            <TabsTrigger value="ots" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ClipboardList className="w-4 h-4 mr-2" />
              {t('workflow.workOrders')}
            </TabsTrigger>
            <TabsTrigger value="layout" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Factory className="w-4 h-4 mr-2" />
              {t('workflow.layout')}
            </TabsTrigger>
            <TabsTrigger value="shifts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="w-4 h-4 mr-2" />
              {t('workflow.shifts')}
            </TabsTrigger>
            <TabsTrigger value="stats" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="w-4 h-4 mr-2" />
              {t('workflow.statistics')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ots" className="mt-4">
            <OTManagement onOTSelect={setSelectedOT} />
          </TabsContent>

          <TabsContent value="layout" className="mt-4">
            {/* Shift Selection */}
            <Card className="bg-card/80 border-border backdrop-blur-sm p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-foreground" />
                  <h3 className="text-lg font-bold text-foreground">Select Shift</h3>
                </div>
                {shifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No shifts configured yet.</p>
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
                    <h3 className="text-lg font-bold text-foreground">Weekly Schedule</h3>
                  </div>
                  <div className="flex items-center gap-2">
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
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3">
                <WorkstationLayout
                  workstations={workstations}
                  assignments={assignments}
                  workers={workers}
                  monthlyOvertimeByWorker={monthlyOvertimeByWorker}
                  selectedShift={selectedShiftId || ""}
                  selectedOT={selectedOT}
                  onWorkerSelect={handleWorkerSelect}
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
          </TabsContent>

          <TabsContent value="shifts" className="mt-4">
            <ShiftManagement onShiftChange={() => refetchAssignments()} />
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <Card className="bg-card/80 border-border backdrop-blur-sm p-6">
              <h3 className="text-xl font-bold text-foreground mb-4">Performance Overview</h3>
              <p className="text-muted-foreground">Detailed statistics coming soon...</p>
            </Card>
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