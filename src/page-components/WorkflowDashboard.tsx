'use client';

import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkstationLayout } from "@/components/workflow/WorkstationLayout";
import { WorkerStatsPanel } from "@/components/workflow/WorkerStatsPanel";
import { ShiftManagement } from "@/components/workflow/ShiftManagement";
import { OTManagement } from "@/components/workflow/OTManagement";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Users, Factory, Clock, BarChart3, ClipboardList, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";

export default function WorkflowDashboard() {
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [selectedOT, setSelectedOT] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOtBg, setActiveOtBg] = useState<string>("hsl(220, 20%, 10%)");
  const { toast } = useToast();
  const { role } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleBackToDashboard = () => {
    const dashboardRoutes: Record<string, string> = {
      supervisor: '/supervisor',
      manager: '/manager',
      admin: '/admin'
    };
    navigate(dashboardRoutes[role || 'supervisor']);
  };

  useEffect(() => {
    fetchShifts();
    fetchWorkers();
    fetchWorkstations();
    fetchAssignments();
  }, []);

  const fetchShifts = async () => {
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .order("start_time");

    if (error) {
      toast({ title: "Error fetching shifts", variant: "destructive" });
      return;
    }

    setShifts(data || []);
    if (!selectedShiftId && data && data.length > 0) {
      setSelectedShiftId(data[0].id);
    }
  };

  const fetchWorkers = async () => {
    const { data, error } = await supabase
      .from("workers")
      .select("*")
      .order("overall_rating", { ascending: false });

    if (error) {
      toast({ title: "Error fetching workers", variant: "destructive" });
      return;
    }
    setWorkers(data || []);
  };

  const fetchWorkstations = async () => {
    const { data, error } = await supabase
      .from("workstations")
      .select("*")
      .order("name");

    if (error) {
      toast({ title: "Error fetching workstations", variant: "destructive" });
      return;
    }
    setWorkstations(data || []);
  };

  const fetchAssignments = async () => {
    const { data, error } = await supabase
      .from("worker_assignments")
      .select(`*, worker:workers(*), workstation:workstations(*), shift:shifts(*)`)
      .eq("date", new Date().toISOString().split("T")[0]);

    if (error) {
      toast({ title: "Error fetching assignments", variant: "destructive" });
      return;
    }
    setAssignments(data || []);
  };

  const handleWorkerSelect = (worker: any) => {
    setSelectedWorker(worker);
  };

  useEffect(() => {
    const storedActive = localStorage.getItem("workflowActiveOtBg");
    if (storedActive) setActiveOtBg(storedActive);
  }, []);

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

    if (!selectedShiftId) {
      toast({
        title: "Select a shift first",
        description: "Choose a shift in the Layout settings before assigning workers.",
        variant: "destructive"
      });
      return;
    }

    const currentAssignments = assignments.filter(a => a.workstation_id === workstation.id);
    if (currentAssignments.length >= workstation.max_workers) {
      toast({
        title: "Workstation at capacity",
        description: `${workstation.name} is already at maximum capacity`,
        variant: "destructive"
      });
      return;
    }

    try {
      if (assignmentId) {
        const { error } = await supabase
          .from("worker_assignments")
          .update({ workstation_id: workstation.id, ot_id: selectedOT?.id || null })
          .eq("id", assignmentId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("worker_assignments")
          .insert({
            worker_id: worker.id,
            workstation_id: workstation.id,
            shift_id: selectedShiftId,
            date: new Date().toISOString().split("T")[0],
            role: "operator",
            ot_id: selectedOT?.id || null
          });
        if (error) throw error;
      }

      toast({
        title: "Worker assigned successfully",
        description: `${worker.name} assigned to ${workstation.name}`
      });

      fetchAssignments();
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
            className="border-accent/40 backdrop-blur-sm p-4 mb-6"
            style={{ backgroundColor: activeOtBg }}
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

            {/* Layout Color Settings */}
            <Card className="bg-card/50 border-border backdrop-blur-sm p-4 mb-4">
              <h3 className="text-lg font-bold text-foreground mb-2">Layout Colors</h3>
              <div className="flex flex-wrap gap-4 text-foreground text-sm">
                <label className="flex items-center gap-2">
                  <span>Active OT Banner</span>
                  <input
                    type="color"
                    value={activeOtBg}
                    onChange={(e) => {
                      setActiveOtBg(e.target.value);
                      localStorage.setItem("workflowActiveOtBg", e.target.value);
                    }}
                    className="h-8 w-10 rounded border border-border bg-transparent p-0"
                  />
                </label>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3">
                <WorkstationLayout
                  workstations={workstations}
                  assignments={assignments}
                  workers={workers}
                  selectedShift={selectedShiftId || ""}
                  selectedOT={selectedOT}
                  onWorkerSelect={handleWorkerSelect}
                  onAssignmentChange={fetchAssignments}
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
            <ShiftManagement onShiftChange={() => fetchAssignments()} />
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