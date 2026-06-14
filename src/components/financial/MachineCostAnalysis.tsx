'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Plus, Edit2, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useMachineCosts } from '@/hooks/use-financial-queries';
import { useMachines } from '@/hooks/use-operations-queries';

interface MachineCost {
  id: string;
  machine_id: string;
  month: string;
  energy_cost: number | null;
  labor_cost: number | null;
  maintenance_cost: number | null;
  spare_parts_cost: number | null;
  total_operating_cost: number | null;
  outsourcing_cost: number | null;
  revenue_generated: number | null;
  notes: string | null;
  machines?: {
    name: string;
    type: string;
  };
}

export const MachineCostAnalysis = () => {
  const { data: costs = [], refetch: refetchCosts } = useMachineCosts();
  const { data: machines = [], refetch: refetchMachines } = useMachines();
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [formData, setFormData] = useState({
    energy_cost: 0,
    labor_cost: 0,
    maintenance_cost: 0,
    spare_parts_cost: 0,
    outsourcing_cost: 0,
    revenue_generated: 0,
    notes: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async () => {
    if (!selectedMachineId && !editingId) {
      toast.error('Please select a machine');
      return;
    }

    const payload = {
      machine_id: editingId ? undefined : selectedMachineId,
      month: editingId ? undefined : selectedMonth + '-01',
      ...formData
    };

    if (editingId) {
      const { error } = await supabase
        .from('machine_costs')
        .update(payload)
        .eq('id', editingId);

      if (error) {
        toast.error('Error updating machine cost data');
        return;
      }
      toast.success('Machine cost data updated');
    } else {
      const { error } = await supabase
        .from('machine_costs')
        .insert([payload] as any);

      if (error) {
        toast.error('Error adding machine cost data');
        return;
      }
      toast.success('Machine cost data added');
    }

    setIsOpen(false);
    resetForm();
    refetchCosts();
    refetchMachines();
  };

  const resetForm = () => {
    setFormData({
      energy_cost: 0,
      labor_cost: 0,
      maintenance_cost: 0,
      spare_parts_cost: 0,
      outsourcing_cost: 0,
      revenue_generated: 0,
      notes: ''
    });
    setSelectedMachineId('');
    setEditingId(null);
  };

  const handleEdit = (cost: MachineCost) => {
    setFormData({
      energy_cost: cost.energy_cost ?? 0,
      labor_cost: cost.labor_cost ?? 0,
      maintenance_cost: cost.maintenance_cost ?? 0,
      spare_parts_cost: cost.spare_parts_cost ?? 0,
      outsourcing_cost: cost.outsourcing_cost ?? 0,
      revenue_generated: cost.revenue_generated ?? 0,
      notes: cost.notes || ''
    });
    setEditingId(cost.id);
    setIsOpen(true);
  };

  // Group costs by machine for chart
  const chartData = machines.map(machine => {
    const machineCosts = costs.filter(c => c.machine_id === machine.id);
    const totalOperating = machineCosts.reduce((sum, c) => sum + (c.total_operating_cost ?? 0), 0);
    const totalOutsourcing = machineCosts.reduce((sum, c) => sum + (c.outsourcing_cost ?? 0), 0);
    const avgOutsourcing = machineCosts.length > 0 ? totalOutsourcing / machineCosts.length : 0;

    return {
      name: machine.name,
      'Operating Cost': totalOperating / machineCosts.length || 0,
      'Outsourcing Cost': avgOutsourcing,
      savings: (avgOutsourcing - (totalOperating / machineCosts.length || 0))
    };
  });

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Comparación de costo de máquina vs tercerización</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Operating Cost" fill="hsl(var(--primary))" />
              <Bar dataKey="Outsourcing Cost" fill="hsl(var(--accent))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => { resetForm(); setIsOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Machine Cost Data
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add'} Machine Cost Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingId && (
              <>
                <div>
                  <Label>Seleccionar máquina</Label>
                  <select
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
                    value={selectedMachineId}
                    onChange={(e) => setSelectedMachineId(e.target.value)}
                  >
                    <option value="">Seleccione una máquina...</option>
                    {machines.map((machine) => (
                      <option key={machine.id} value={machine.id}>
                        {machine.name} ({machine.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Month</Label>
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Energy Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.energy_cost}
                  onChange={(e) => setFormData({ ...formData, energy_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Labor Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.labor_cost}
                  onChange={(e) => setFormData({ ...formData, labor_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Maintenance Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.maintenance_cost}
                  onChange={(e) => setFormData({ ...formData, maintenance_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Spare Parts Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.spare_parts_cost}
                  onChange={(e) => setFormData({ ...formData, spare_parts_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Outsourcing Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.outsourcing_cost}
                  onChange={(e) => setFormData({ ...formData, outsourcing_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Revenue Generated ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.revenue_generated}
                  onChange={(e) => setFormData({ ...formData, revenue_generated: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas adicionales..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsOpen(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={handleSubmit}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Machine Cost Details */}
      <Card>
        <CardHeader>
          <CardTitle>Desglose de costos de máquina</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-medium">Máquina</th>
                  <th className="text-left py-2 px-4 font-medium">Month</th>
                  <th className="text-right py-2 px-4 font-medium">Costo operativo</th>
                  <th className="text-right py-2 px-4 font-medium">Costo de tercerización</th>
                  <th className="text-right py-2 px-4 font-medium">Difference</th>
                  <th className="text-center py-2 px-4 font-medium">Recommendation</th>
                  <th className="text-center py-2 px-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((cost) => {
                  const difference = (cost.outsourcing_cost ?? 0) - (cost.total_operating_cost ?? 0);
                  const shouldOutsource = difference > 0;
                  return (
                    <tr key={cost.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-4">{cost.machines?.name}</td>
                      <td className="py-2 px-4">{new Date(cost.month).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}</td>
                      <td className="py-2 px-4 text-right font-semibold text-destructive">
                        ${Math.round(cost.total_operating_cost ?? 0).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-accent">
                        ${Math.round(cost.outsourcing_cost ?? 0).toLocaleString('es-CL')}
                      </td>
                      <td className={`py-2 px-4 text-right font-bold ${shouldOutsource ? 'text-green-500' : 'text-red-500'}`}>
                        {shouldOutsource ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
                        ${Math.round(Math.abs(difference)).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2 px-4 text-center">
                        {shouldOutsource ? (
                          <span className="text-green-500 font-semibold">Keep In-House</span>
                        ) : (
                          <span className="text-yellow-500 font-semibold">Consider Outsourcing</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(cost)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {chartData.some(d => d.savings < 0) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Some machines show higher operating costs than outsourcing. Review the equipment investment section for replacement options.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
