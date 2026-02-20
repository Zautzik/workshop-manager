'use client';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Star, TrendingUp, Clock, Users, Zap, Award } from "lucide-react";

interface WorkerStatsPanelProps {
  selectedWorker: any;
  workers: any[];
  onWorkerSelect: (worker: any) => void;
}

/**
 * WorkerStatsPanel - Display detailed worker statistics
 * Similar to FIFA player info panel with radar chart
 */
export function WorkerStatsPanel({
  selectedWorker,
  workers,
  onWorkerSelect,
}: WorkerStatsPanelProps) {
  
  const getStatColor = (value: number) => {
    if (value >= 80) return "text-green-400";
    if (value >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getStatBarColor = (value: number) => {
    if (value >= 80) return "bg-green-500";
    if (value >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-4">
      {/* Selected Worker Detail */}
      {selectedWorker ? (
        <Card className="bg-card border-2 border-border p-6">
          {/* Worker Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
                {selectedWorker.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground">{selectedWorker.name}</h3>
                <p className="text-muted-foreground">{selectedWorker.department}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-primary">
                {selectedWorker.overall_rating}
              </div>
              <p className="text-xs text-muted-foreground">OVERALL</p>
            </div>
          </div>

          {/* Performance Stats */}
          <div className="space-y-3 mb-4">
            <div className="bg-muted/40 rounded p-3 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-foreground">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-medium">Sheets/Hour</span>
                </div>
                <span className={`text-lg font-bold ${getStatColor(selectedWorker.sheets_per_hour || 0)}`}>
                  {selectedWorker.sheets_per_hour || 0}
                </span>
              </div>
              <Progress 
                value={Math.min((selectedWorker.sheets_per_hour || 0) / 10, 100)} 
                className="h-2"
              />
            </div>

            <div className="bg-muted/40 rounded p-3 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-foreground">
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium">Teamwork</span>
                </div>
                <span className={`text-lg font-bold ${getStatColor(selectedWorker.teamwork_rating || 0)}`}>
                  {selectedWorker.teamwork_rating || 0}
                </span>
              </div>
              <Progress 
                value={selectedWorker.teamwork_rating || 0} 
                className="h-2"
              />
            </div>

            <div className="bg-muted/40 rounded p-3 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-foreground">
                  <Award className="w-4 h-4" />
                  <span className="text-sm font-medium">Quality</span>
                </div>
                <span className={`text-lg font-bold ${getStatColor(selectedWorker.quality_score || 0)}`}>
                  {selectedWorker.quality_score || 0}
                </span>
              </div>
              <Progress 
                value={selectedWorker.quality_score || 0} 
                className="h-2"
              />
            </div>

            <div className="bg-muted/40 rounded p-3 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-foreground">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm font-medium">Speed</span>
                </div>
                <span className={`text-lg font-bold ${getStatColor(selectedWorker.speed_score || 0)}`}>
                  {selectedWorker.speed_score || 0}
                </span>
              </div>
              <Progress 
                value={selectedWorker.speed_score || 0} 
                className="h-2"
              />
            </div>

            <div className="bg-muted/40 rounded p-3 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">Attendance</span>
                </div>
                <span className={`text-lg font-bold ${getStatColor(selectedWorker.attendance_score || 0)}`}>
                  {selectedWorker.attendance_score || 0}
                </span>
              </div>
              <Progress 
                value={selectedWorker.attendance_score || 0} 
                className="h-2"
              />
            </div>
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-2">
            <Badge 
              variant="outline" 
              className={`justify-center ${
                selectedWorker.overtime_availability 
                  ? "bg-primary/15 border-primary/40 text-foreground" 
                  : "bg-muted border-border text-muted-foreground"
              }`}
            >
              {selectedWorker.overtime_availability ? "OT Available" : "No OT"}
            </Badge>
            <Badge variant="outline" className="justify-center bg-muted border-border text-foreground">
              {selectedWorker.lateness_minutes || 0} min late
            </Badge>
          </div>
        </Card>
      ) : (
        <Card className="bg-card border-border p-6 text-center">
          <Star className="w-12 h-12 mx-auto mb-2 text-primary/70" />
          <p className="text-foreground">Select a worker to view stats</p>
        </Card>
      )}

      {/* All Workers List */}
      <Card className="bg-card border-border p-4">
        <h3 className="text-lg font-bold text-foreground mb-3">All Workers</h3>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-2">
            {workers.map((worker) => (
              <div
                key={worker.id}
                onClick={() => onWorkerSelect(worker)}
                className={`rounded border p-3 transition-colors cursor-pointer ${
                  selectedWorker?.id === worker.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted/30 hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {worker.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{worker.name}</p>
                      <p className="text-xs text-muted-foreground">{worker.department}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-primary">
                      {worker.overall_rating || 75}
                    </div>
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < Math.floor((worker.overall_rating || 75) / 20)
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-gray-500"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
