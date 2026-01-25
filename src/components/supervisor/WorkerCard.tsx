'use client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Star, Clock, TrendingUp } from 'lucide-react';
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

const WorkerCard = ({ worker, onSelect, onLogTask, selected, showActions = true }: WorkerCardProps) => {
  const { t } = useLanguage();
  
  const rating = Math.round(worker.avg_rating || 50);
  const efficiency = Math.round(worker.efficiency_score || 50);
  const avgTime = Math.round(worker.avg_time_minutes || 0);
  const totalTasks = worker.total_tasks || 0;
  
  const getRatingColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card 
      className={`p-4 hover:shadow-lg transition-all cursor-pointer bg-gradient-to-br from-card via-card to-supervisor/5 border-2 ${
        selected ? 'border-supervisor shadow-supervisor/20' : 'border-border hover:border-supervisor/50'
      }`}
      onClick={() => onSelect?.(worker.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-lg truncate">{worker.name}</h3>
          <Badge variant="outline" className="mt-1">
            {t(worker.department)}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`h-3 w-3 ${
                i < Math.floor(rating / 20) ? 'fill-yellow-400 text-yellow-400' : 'text-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-3">
        {/* Efficiency */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {t('efficiencyScore')}
            </span>
            <span className={`font-bold ${getRatingColor(efficiency)}`}>
              {efficiency}%
            </span>
          </div>
          <Progress value={efficiency} className="h-2" />
        </div>

        {/* Rating */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              {t('rating')}
            </span>
            <span className={`font-bold ${getRatingColor(rating)}`}>
              {rating}/100
            </span>
          </div>
          <Progress value={rating} className="h-2" />
        </div>

        {/* Avg Time */}
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {t('avgTime')}
          </span>
          <span className="font-medium">{avgTime} min</span>
        </div>

        {/* Total Tasks */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t('totalTasks')}</span>
          <span className="font-medium">{totalTasks}</span>
        </div>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="mt-4 pt-3 border-t">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              onLogTask?.(worker.id);
            }}
          >
            {t('logTask')}
          </Button>
        </div>
      )}
    </Card>
  );
};

export default WorkerCard;
