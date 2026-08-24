'use client';
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkerStats } from '@/hooks/use-operations-queries';
import { toast } from 'sonner';
import { DEPARTMENTS } from '@/lib/departments';
import WorkerCard from '../supervisor/WorkerCard';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';

const WorkerStatsReport = () => {
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const { data: workers = [], isError } = useWorkerStats(departmentFilter);

  const safeWorkers = useMemo(() => {
    return workers.filter((worker: any) => worker?.id && worker?.name);
  }, [workers]);

  useEffect(() => {
    if (isError) {
      toast.error('No se pudieron cargar las estadísticas del equipo');
    }
  }, [isError]);

  const calculateAverages = () => {
    if (safeWorkers.length === 0) return { avgEfficiency: 0, avgRating: 0, totalTasks: 0 };
    
    const avgEfficiency = safeWorkers.reduce((sum: number, w: any) => sum + (w.efficiency_score || 0), 0) / safeWorkers.length;
    const avgRating = safeWorkers.reduce((sum: number, w: any) => sum + (w.avg_rating || 0), 0) / safeWorkers.length;
    const totalTasks = safeWorkers.reduce((sum: number, w: any) => sum + (w.total_tasks || 0), 0);
    
    return {
      avgEfficiency: Math.round(avgEfficiency),
      avgRating: Math.round(avgRating),
      totalTasks,
    };
  };

  const stats = calculateAverages();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-manager/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-manager">Eficiencia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgEfficiency}%</div>
            <p className="text-xs text-muted-foreground mt-1">Promedio entre todos los trabajadores</p>
          </CardContent>
        </Card>

        <Card className="border-manager/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-manager">Calificación</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgRating}/100</div>
            <p className="text-xs text-muted-foreground mt-1">Promedio de desempeño</p>
          </CardContent>
        </Card>

        <Card className="border-manager/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-manager">Total de Tareas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">Completado entre todos los trabajadores</p>
          </CardContent>
        </Card>
      </div>

      {/* Worker Grid */}
      <Card className="border-manager/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-manager">Estadísticas de Trabajadores</CardTitle>
            <div className="flex gap-2">
              {/* Antes eran cinco claves en inglés que nunca calzaron con el
                  texto libre real de employees.department — el filtro volvía
                  vacío para cualquier opción menos "Todos" (2026-08 audit).
                  DEPARTMENTS es la misma taxonomía que usa el alta de
                  personas, para que no haya una segunda lista que diverja. */}
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Trabajadores</SelectItem>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <FileDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {safeWorkers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay datos disponibles
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {safeWorkers.map((worker: any) => (
                <WorkerCard
                  key={worker.id}
                  worker={worker}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkerStatsReport;
