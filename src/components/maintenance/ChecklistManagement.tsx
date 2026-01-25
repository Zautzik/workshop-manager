'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, FileText, CheckCircle2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Checklist {
  id: string;
  name: string;
  description: string;
  frequency: string;
  machine_id: string;
  machines: { name: string };
  maintenance_tasks: Task[];
}

interface Task {
  id: string;
  task_number: number;
  description: string;
  estimated_minutes: number;
}

interface Machine {
  id: string;
  name: string;
}

export default function ChecklistManagement() {
  const { toast } = useToast();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState<string | null>(null);
  const [workOrderDate, setWorkOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [workOrderPriority, setWorkOrderPriority] = useState('3');

  useEffect(() => {
    fetchChecklists();
    fetchMachines();
  }, []);

  const fetchChecklists = async () => {
    const { data, error } = await supabase
      .from('maintenance_checklists')
      .select(`
        *,
        machines(name),
        maintenance_tasks(id, task_number, description, estimated_minutes)
      `)
      .order('frequency');

    if (error) {
      toast({ title: 'Error', description: 'Failed to fetch checklists', variant: 'destructive' });
    } else {
      setChecklists(data || []);
    }
    setLoading(false);
  };

  const fetchMachines = async () => {
    const { data } = await supabase.from('machines').select('id, name');
    setMachines(data || []);
  };

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case 'daily': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'weekly': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'biweekly': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'monthly': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'quarterly': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'semiannual': return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
      case 'annual': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTotalTime = (tasks: Task[]) => {
    return tasks?.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0) || 0;
  };

  const createWorkOrder = async () => {
    if (!selectedChecklist) return;
    
    const checklist = checklists.find(c => c.id === selectedChecklist);
    if (!checklist) return;

    const { data: workOrder, error } = await supabase
      .from('maintenance_work_orders')
      .insert({
        checklist_id: selectedChecklist,
        machine_id: checklist.machine_id,
        scheduled_date: new Date(workOrderDate).toISOString(),
        priority: parseInt(workOrderPriority),
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: 'Failed to create work order', variant: 'destructive' });
      return;
    }

    // Create task completions for each task
    const taskCompletions = checklist.maintenance_tasks.map(task => ({
      work_order_id: workOrder.id,
      task_id: task.id,
      completed: false
    }));

    const { error: tasksError } = await supabase
      .from('maintenance_task_completions')
      .insert(taskCompletions);

    if (tasksError) {
      toast({ title: 'Warning', description: 'Work order created but tasks may need manual setup', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Work order created successfully' });
    }

    setDialogOpen(false);
    setSelectedChecklist(null);
  };

  // Group checklists by machine
  const groupedChecklists = checklists.reduce((acc, checklist) => {
    const machineName = checklist.machines?.name || 'Unknown Machine';
    if (!acc[machineName]) acc[machineName] = [];
    acc[machineName].push(checklist);
    return acc;
  }, {} as Record<string, Checklist[]>);

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
        <h2 className="text-2xl font-bold text-foreground">Checklist Templates</h2>
        <Badge variant="outline" className="text-muted-foreground">
          {checklists.length} checklists
        </Badge>
      </div>

      <Accordion type="multiple" className="space-y-4">
        {Object.entries(groupedChecklists).map(([machineName, machineChecklists]) => (
          <AccordionItem key={machineName} value={machineName} className="border border-border/40 rounded-lg bg-card/50 backdrop-blur">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-4">
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">{machineName}</span>
                <Badge variant="outline" className="ml-2">
                  {machineChecklists.length} templates
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {machineChecklists.map(checklist => (
                  <Card key={checklist.id} className="border-border/40 bg-card/30">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{checklist.name}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {checklist.description}
                          </p>
                        </div>
                        <Badge variant="outline" className={getFrequencyColor(checklist.frequency)}>
                          {checklist.frequency}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          {checklist.maintenance_tasks?.length || 0} tasks
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          ~{getTotalTime(checklist.maintenance_tasks)} min
                        </div>
                      </div>

                      <Dialog open={dialogOpen && selectedChecklist === checklist.id} onOpenChange={(open) => {
                        setDialogOpen(open);
                        if (!open) setSelectedChecklist(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button 
                            size="sm" 
                            className="w-full"
                            onClick={() => setSelectedChecklist(checklist.id)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create Work Order
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create Work Order</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Checklist</Label>
                              <Input value={checklist.name} disabled />
                            </div>
                            <div className="space-y-2">
                              <Label>Machine</Label>
                              <Input value={checklist.machines?.name} disabled />
                            </div>
                            <div className="space-y-2">
                              <Label>Scheduled Date</Label>
                              <Input 
                                type="date" 
                                value={workOrderDate}
                                onChange={(e) => setWorkOrderDate(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Priority</Label>
                              <Select value={workOrderPriority} onValueChange={setWorkOrderPriority}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">Low (1)</SelectItem>
                                  <SelectItem value="2">Normal (2)</SelectItem>
                                  <SelectItem value="3">Medium (3)</SelectItem>
                                  <SelectItem value="4">High (4)</SelectItem>
                                  <SelectItem value="5">Critical (5)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button onClick={createWorkOrder} className="w-full">
                              <Calendar className="h-4 w-4 mr-2" />
                              Schedule Work Order
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
