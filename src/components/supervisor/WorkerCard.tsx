'use client';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

interface WorkerCardProps {
  worker: {
    id: string;
    name: string;
    department: string;
    total_tasks?: number;
    avg_time_minutes?: number;
    avg_rating?: number;
    efficiency_score?: number;
  };
  onSelect?: (workerId: string) => void;
  onLogTask?: (workerId: string) => void;
  selected?: boolean;
  showActions?: boolean;
}

const WorkerCard = ({ worker, onSelect, selected }: WorkerCardProps) => {
  const { t } = useLanguage();
  
  const efficiency = Math.round(worker.efficiency_score || 50);
  const avgTime = Math.round(worker.avg_time_minutes || 0);
  
  // Discrete overtime / efficiency warning via border color
  const isOvertimeWarning = avgTime > 480; // more than 8h avg
  const isLowEfficiency = efficiency < 60;

  const borderColor = isOvertimeWarning
    ? 'border-amber-500'
    : isLowEfficiency
      ? 'border-red-400/60'
      : selected
        ? 'border-supervisor'
        : 'border-border';

  const bgHighlight = isOvertimeWarning
    ? 'bg-amber-500/5'
    : isLowEfficiency
      ? 'bg-red-500/5'
      : '';

  return (
    <Card 
      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-all hover:shadow-md border ${borderColor} ${bgHighlight}`}
      onClick={() => onSelect?.(worker.id)}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
        isOvertimeWarning
          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
          : 'bg-primary/20 text-primary'
      }`}>
        {worker.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{worker.name}</p>
        <p className="text-xs text-muted-foreground">{t(worker.department)}</p>
      </div>
      {isOvertimeWarning && (
        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">OT</span>
      )}
    </Card>
  );
};

export default WorkerCard;
