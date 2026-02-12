'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, Play, CheckCircle, Wrench, AlertCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ChecklistItem {
  id: string;
  step: number;
  title: string;
  description: string;
  estimatedTime: number;
  priority: string;
  toolsRequired?: string[];
}

interface WorkOrder {
  id: string;
  status: string;
  priority: number;
  scheduled_date: string;
  started_at: string | null;
  total_time_minutes: number;
  notes: string | null;
  checklist_id: string;
  machine_id: string | null;
  machines: { name: string; type: string } | null;
  maintenance_checklists: {
    name: string;
    frequency: string | null;
    machine_type: string;
    items: ChecklistItem[];
  } | null;
}

// Unified task representation that works for both FK and JSONB approaches
interface TaskEntry {
  id: string;
  step: number;
  description: string;
  estimatedMinutes: number;
  completed: boolean;
  notes: string;
  // If this comes from the FK approach (maintenance_task_completions)
  completionId?: string;
}

export default function WorkOrderExecution() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  const fetchWorkOrders = async () => {
    const { data, error } = await supabase
      .from('maintenance_work_orders')
      .select(`
        *,
        machines(name, type),
        maintenance_checklists(name, frequency, machine_type, items)
      `)
      .in('status', ['pending', 'in_progress'])
      .order('priority', { ascending: false })
      .order('scheduled_date', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: 'Failed to fetch work orders', variant: 'destructive' });
    } else {
      // Cast to handle JSONB items field from Supabase
      setWorkOrders((data || []) as unknown as WorkOrder[]);
    }
    setLoading(false);
  };

  const loadTasksForOrder = async (order: WorkOrder) => {
    // First, try to load from the FK-based maintenance_task_completions table
    const { data: fkTasks, error: fkError } = await supabase
      .from('maintenance_task_completions')
      .select(`
        *,
        maintenance_tasks(task_number, description, estimated_minutes)
      `)
      .eq('work_order_id', order.id)
      .order('created_at');

    if (!fkError && fkTasks && fkTasks.length > 0) {
      // FK approach: we have task completions linked to maintenance_tasks
      const mapped: TaskEntry[] = fkTasks.map((tc: any) => ({
        id: tc.task_id,
        step: tc.maintenance_tasks?.task_number || 0,
        description: tc.maintenance_tasks?.description || 'Task',
        estimatedMinutes: tc.maintenance_tasks?.estimated_minutes || 15,
        completed: tc.completed || false,
        notes: tc.notes || '',
        completionId: tc.id,
      }));
      setTasks(mapped);
      const notes: Record<string, string> = {};
      mapped.forEach(t => { notes[t.id] = t.notes; });
      setTaskNotes(notes);
      return;
    }

    // JSONB approach: read items from checklist
    const checklistItems = order.maintenance_checklists?.items;
    if (Array.isArray(checklistItems) && checklistItems.length > 0) {
      const mapped: TaskEntry[] = checklistItems.map((item: any) => ({
        id: item.id || `item-${item.step}`,
        step: item.step || 0,
        description: item.title || item.description || 'Task',
        estimatedMinutes: item.estimatedTime || item.estimated_minutes || 15,
        completed: false,
        notes: '',
      }));
      setTasks(mapped);
      const notes: Record<string, string> = {};
      mapped.forEach(t => { notes[t.id] = ''; });
      setTaskNotes(notes);
      return;
    }

    // No tasks found at all
    setTasks([]);
    setTaskNotes({});
  };

  const startWorkOrder = async (order: WorkOrder) => {
    const { error } = await supabase
      .from('maintenance_work_orders')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', order.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to start work order', variant: 'destructive' });
    } else {
      toast({ title: 'Started', description: 'Work order started' });
      const updatedOrder = { ...order, status: 'in_progress', started_at: new Date().toISOString() };
      setSelectedOrder(updatedOrder);
      await loadTasksForOrder(updatedOrder);
      fetchWorkOrders();
    }
  };

  const openWorkOrder = async (order: WorkOrder) => {
    setSelectedOrder(order);
    await loadTasksForOrder(order);
    setExecuting(true);
  };

  const toggleTaskCompletion = async (task: TaskEntry) => {
    const newCompleted = !task.completed;
    
    // If FK-based, update in DB
    if (task.completionId) {
      const { error } = await supabase
        .from('maintenance_task_completions')
        .update({
          completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
          completed_by: newCompleted ? user?.id : null,
          notes: taskNotes[task.id] || null
        })
        .eq('id', task.completionId);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update task', variant: 'destructive' });
        return;
      }
    }

    // Update local state
    setTasks(prev => 
      prev.map(t => t.id === task.id ? { ...t, completed: newCompleted } : t)
    );
  };

  const completeWorkOrder = async () => {
    if (!selectedOrder) return;

    const allCompleted = tasks.every(t => t.completed);
    if (!allCompleted) {
      toast({ title: 'Warning', description: 'Please complete all tasks first', variant: 'destructive' });
      return;
    }

    const totalTime = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);

    const { error } = await supabase
      .from('maintenance_work_orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_time_minutes: totalTime
      })
      .eq('id', selectedOrder.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to complete work order', variant: 'destructive' });
    } else {
      toast({ title: 'Completed', description: 'Work order completed successfully' });
      setExecuting(false);
      setSelectedOrder(null);
      fetchWorkOrders();
    }
  };

  const getCompletionProgress = () => {
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.completed).length;
    return (completed / tasks.length) * 100;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 4) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (priority >= 3) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Active Work Orders</h2>
        <Badge variant="outline" className="text-muted-foreground">
          {workOrders.length} active
        </Badge>
      </div>

      {workOrders.length === 0 ? (
        <Card className="p-12 border-border/40 bg-card/50 backdrop-blur">
          <div className="text-center">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <p className="text-muted-foreground">All maintenance tasks completed!</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workOrders.map(order => (
            <Card key={order.id} className="border-border/40 bg-card/50 backdrop-blur hover:bg-card/70 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {order.machines?.name || order.maintenance_checklists?.machine_type || 'Machine'}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {order.maintenance_checklists?.name}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Badge variant="outline" className={getPriorityColor(order.priority)}>
                      P{order.priority}
                    </Badge>
                    <Badge variant="outline" className={getStatusColor(order.status)}>
                      {order.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {new Date(order.scheduled_date).toLocaleDateString()}
                  </div>
                </div>

                {order.status === 'pending' ? (
                  <Button onClick={() => startWorkOrder(order)} className="w-full">
                    <Play className="h-4 w-4 mr-2" />
                    Start Work Order
                  </Button>
                ) : (
                  <Button onClick={() => openWorkOrder(order)} variant="outline" className="w-full">
                    <Wrench className="h-4 w-4 mr-2" />
                    Continue Execution
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Execution Dialog */}
      <Dialog open={executing} onOpenChange={setExecuting}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              {selectedOrder?.maintenance_checklists?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">
                    {tasks.filter(t => t.completed).length} / {tasks.length} tasks
                  </span>
                </div>
                <Progress value={getCompletionProgress()} className="h-2" />
              </div>

              {/* Task List */}
              {tasks.length === 0 ? (
                <Card className="p-6 border-border/40 bg-card/50">
                  <div className="text-center">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No tasks found for this work order.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      The associated checklist may not have items defined.
                    </p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-3">
                  {tasks.map(task => (
                    <Card key={task.id} className={`p-4 border-border/40 transition-colors ${task.completed ? 'bg-green-500/10' : 'bg-card/50'}`}>
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={task.completed}
                          onCheckedChange={() => toggleTaskCompletion(task)}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                              {task.step}. {task.description}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              ~{task.estimatedMinutes} min
                            </Badge>
                          </div>
                          {!task.completed && (
                            <Textarea
                              placeholder="Add notes (optional)"
                              value={taskNotes[task.id] || ''}
                              onChange={(e) => setTaskNotes(prev => ({ ...prev, [task.id]: e.target.value }))}
                              className="text-sm"
                              rows={2}
                            />
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {/* Complete Button */}
              <Button
                onClick={completeWorkOrder}
                className="w-full"
                disabled={tasks.length === 0 || !tasks.every(t => t.completed)}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete Work Order
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
