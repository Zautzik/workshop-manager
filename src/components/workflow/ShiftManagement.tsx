'use client';
import { useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Factory, Package, Clock, AlertCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMachines, useOTs } from "@/hooks/use-queries";

interface ShiftManagementProps {
  onShiftChange: () => void;
}

interface MachineWithOT {
  id: string;
  name: string;
  type: string;
  status: string;
  currentOT?: {
    id: string;
    ot_number: string;
    client_name: string;
    quantity: number;
    status: string;
    priority: number;
  };
}

/**
 * ShiftManagement - Gantt-style view of machines and their OT assignments
 */
export function ShiftManagement({ onShiftChange }: ShiftManagementProps) {
  const { toast } = useToast();
  const { data: machines = [], isError: machinesError, isLoading: machinesLoading } = useMachines();
  const { data: ots = [], isError: otsError, isLoading: otsLoading } = useOTs();

  useEffect(() => {
    if (machinesError || otsError) {
      toast({
        title: "Error loading machine schedule",
        description: "Failed to load machines or work orders",
        variant: "destructive"
      });
    }
  }, [machinesError, otsError, toast]);

  const machinesWithOTs = useMemo<MachineWithOT[]>(() => {
    const activeOts = ots.filter((ot: any) => ot.status !== "completed");

    return machines.map((machine: any) => {
      const currentOT = activeOts.find((ot: any) => {
        if (machine.type === "offset_printer" && ot.status === "offset_printing") return true;
        if (machine.type === "die_cutter" && ot.status === "die_cutting") return true;
        if (machine.type === "guillotine" && (ot.status === "guillotine_first_cut" || ot.status === "guillotine_final_cut")) return true;
        if (machine.type === "manual_workshop" && ot.status === "workshop_revision") return true;
        if (machine.type === "delivery" && ot.status === "in_delivery") return true;
        return false;
      });

      return {
        id: machine.id,
        name: machine.name,
        type: machine.type,
        status: machine.status,
        currentOT: currentOT ? {
          id: currentOT.id,
          ot_number: currentOT.ot_number,
          client_name: currentOT.client_name,
          quantity: currentOT.quantity,
          status: currentOT.status,
          priority: currentOT.priority,
        } : undefined,
      };
    });
  }, [machines, ots]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: "bg-gray-500",
      running: "bg-green-500",
      maintenance: "bg-yellow-500",
      offline: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 4) return "bg-red-500/20 border-red-500/40 text-red-300";
    if (priority >= 2) return "bg-yellow-500/20 border-yellow-500/40 text-yellow-300";
    return "bg-blue-500/20 border-blue-500/40 text-blue-300";
  };

  const getOTStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      paper_purchase: "bg-purple-500",
      printing: "bg-blue-500",
      cutting: "bg-cyan-500",
      folding: "bg-green-500",
      packaging: "bg-orange-500",
      quality_check: "bg-yellow-500",
      completed: "bg-gray-500",
    };
    return colors[status] || "bg-gray-500";
  };

  if (machinesLoading || otsLoading) {
    return (
      <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
        <CardContent className="p-8 text-center text-white">
          <Clock className="w-12 h-12 mx-auto mb-4 animate-spin" />
          <p>Loading machine schedule...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <Alert className="bg-blue-500/20 border-blue-500/40">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-white">
          <strong>How to use:</strong> This Gantt view shows each machine and its currently assigned work order. 
          OTs are automatically assigned to machines based on their current workflow status. The timeline shows real-time machine utilization.
        </AlertDescription>
      </Alert>

      <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Factory className="w-6 h-6" />
            Machine Schedule - Gantt View
          </CardTitle>
          <p className="text-sm text-blue-200">Real-time view of machines and their assigned work orders</p>
        </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-4">
            {machinesWithOTs.map((machine) => (
              <div
                key={machine.id}
                className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Factory className="w-8 h-8 text-blue-300" />
                    <div>
                      <h3 className="text-lg font-bold text-white">{machine.name}</h3>
                      <p className="text-sm text-blue-200 capitalize">{machine.type} machine</p>
                    </div>
                  </div>
                  <Badge className={`${getStatusColor(machine.status)} text-white`}>
                    {machine.status}
                  </Badge>
                </div>

                {/* Gantt-style timeline bar */}
                <div className="relative h-16 bg-slate-800/50 rounded-lg border border-white/10 overflow-hidden">
                  {machine.currentOT ? (
                    <div className="absolute inset-0 flex items-center px-4">
                      <div className={`flex-1 h-12 rounded flex items-center justify-between px-4 ${getPriorityColor(machine.currentOT.priority)} border`}>
                        <div className="flex items-center gap-3">
                          <Package className="w-5 h-5" />
                          <div>
                            <p className="font-bold text-white">{machine.currentOT.ot_number}</p>
                            <p className="text-xs text-white/70">{machine.currentOT.client_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${getOTStatusColor(machine.currentOT.status)} text-white text-xs`}>
                            {machine.currentOT.status.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm text-white/90 font-medium">
                            {machine.currentOT.quantity} units
                          </span>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-white/70" />
                            <span className="text-xs text-white/70">In Progress</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-white/40">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm">No active work order</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
