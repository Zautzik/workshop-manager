'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkerStats } from '@/hooks/use-queries';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import WorkerCard from './WorkerCard';
import TaskLogDialog from './TaskLogDialog';

interface WorkerRosterProps {
  departmentFilter?: string;
  onWorkerSelect?: (workerId: string) => void;
  selectedWorkers?: string[];
  showActions?: boolean;
}

const WorkerRoster = ({ 
  departmentFilter, 
  onWorkerSelect, 
  selectedWorkers = [],
  showActions = true 
}: WorkerRosterProps) => {
  const { t } = useLanguage();
  const { data: workers = [], refetch: refetchWorkers, isError } = useWorkerStats(departmentFilter);
  const [filteredWorkers, setFilteredWorkers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [showTaskLog, setShowTaskLog] = useState(false);

  useEffect(() => {
    filterAndSortWorkers();
  }, [workers, searchTerm, sortBy, departmentFilter]);

  useEffect(() => {
    if (isError) {
      toast.error('Error loading workers');
    }
  }, [isError]);

  const filterAndSortWorkers = () => {
    let filtered = [...workers];
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter((w) =>
        (w.name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name ?? '').localeCompare(b.name ?? '');
        case 'efficiency':
          return (b.efficiency_score || 0) - (a.efficiency_score || 0);
        case 'rating':
          return (b.avg_rating || 0) - (a.avg_rating || 0);
        case 'tasks':
          return (b.total_tasks || 0) - (a.total_tasks || 0);
        default:
          return 0;
      }
    });
    
    setFilteredWorkers(filtered);
  };

  const handleWorkerSelect = (workerId: string) => {
    onWorkerSelect?.(workerId);
  };

  const handleLogTask = (workerId: string) => {
    setSelectedWorkerId(workerId);
    setShowTaskLog(true);
  };

  return (
    <>
      <Card className="border-supervisor/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-supervisor">{t('workerRoster')}</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-48"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{t('name')}</SelectItem>
                  <SelectItem value="efficiency">{t('efficiencyScore')}</SelectItem>
                  <SelectItem value="rating">{t('rating')}</SelectItem>
                  <SelectItem value="tasks">{t('totalTasks')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredWorkers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('noData')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredWorkers.map((worker) => (
                <WorkerCard
                  key={worker.id}
                  worker={worker}
                  onSelect={handleWorkerSelect}
                  onLogTask={handleLogTask}
                  selected={selectedWorkers.includes(worker.id)}
                  showActions={showActions}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskLogDialog
        open={showTaskLog}
        onOpenChange={setShowTaskLog}
        workerId={selectedWorkerId}
        onSuccess={refetchWorkers}
      />
    </>
  );
};

export default WorkerRoster;
