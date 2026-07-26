'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Edit2, TrendingUp, Clock, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useEquipmentInvestments } from '@/hooks/use-financial-queries';
import { useMachines } from '@/hooks/use-operations-queries';

interface Investment {
  id: string;
  machine_id: string | null;
  equipment_name: string;
  purchase_cost: number;
  estimated_annual_savings: number | null;
  payback_period_months: number | null;
  status: string | null;
  notes: string | null;
  machines?: {
    name: string;
  } | null;
}

export const EquipmentInvestmentAnalysis = () => {
  const { data: investments = [], refetch: refetchInvestments } = useEquipmentInvestments();
  const { data: machines = [], refetch: refetchMachines } = useMachines();
  const [formData, setFormData] = useState({
    machine_id: '',
    equipment_name: '',
    purchase_cost: 0,
    estimated_annual_savings: 0,
    status: 'proposal',
    notes: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async () => {
    if (!formData.equipment_name) {
      toast.error('Ingresa el nombre del equipo');
      return;
    }

    const payload = {
      machine_id: formData.machine_id || null,
      equipment_name: formData.equipment_name,
      purchase_cost: formData.purchase_cost,
      estimated_annual_savings: formData.estimated_annual_savings,
      status: formData.status,
      notes: formData.notes
    };

    const res = editingId
      ? await fetch(`/api/equipment-investments?id=${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
      : await fetch('/api/equipment-investments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(
        body?.error || (editingId ? 'No se pudo actualizar la inversión' : 'No se pudo agregar la inversión')
      );
      return;
    }
    toast.success(editingId ? 'Inversión actualizada' : 'Propuesta de inversión agregada');

    setIsOpen(false);
    resetForm();
    refetchInvestments();
    refetchMachines();
  };

  const resetForm = () => {
    setFormData({
      machine_id: '',
      equipment_name: '',
      purchase_cost: 0,
      estimated_annual_savings: 0,
      status: 'proposal',
      notes: ''
    });
    setEditingId(null);
  };

  const handleEdit = (investment: Investment) => {
    setFormData({
      machine_id: investment.machine_id || '',
      equipment_name: investment.equipment_name,
      purchase_cost: investment.purchase_cost,
      estimated_annual_savings: investment.estimated_annual_savings ?? 0,
      status: investment.status || 'proposal',
      notes: investment.notes || ''
    });
    setEditingId(investment.id);
    setIsOpen(true);
  };

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/equipment-investments?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || 'No se pudo actualizar el estado');
      return;
    }
    toast.success('Estado actualizado');
    refetchInvestments();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'proposal': return 'bg-blue-500';
      case 'approved': return 'bg-green-500';
      case 'rejected': return 'bg-red-500';
      case 'completed': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const totalProposed = investments
    .filter(i => (i.status ?? '') === 'proposal')
    .reduce((sum, i) => sum + i.purchase_cost, 0);

  const totalApproved = investments
    .filter(i => (i.status ?? '') === 'approved')
    .reduce((sum, i) => sum + i.purchase_cost, 0);

  const estimatedAnnualSavings = investments
    .filter(i => ['approved', 'completed'].includes(i.status ?? ''))
    .reduce((sum, i) => sum + (i.estimated_annual_savings ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Proposed Investment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">${Math.round(totalProposed).toLocaleString('es-CL')}</div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Approved Investment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">${Math.round(totalApproved).toLocaleString('es-CL')}</div>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Est. Annual Savings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">${Math.round(estimatedAnnualSavings).toLocaleString('es-CL')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => { resetForm(); setIsOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Investment Proposal
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add'} Equipment Investment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre del equipo</Label>
              <Input
                value={formData.equipment_name}
                onChange={(e) => setFormData({ ...formData, equipment_name: e.target.value })}
                placeholder="ej., Nueva prensa offset 5000"
              />
            </div>

            <div>
              <Label>Máquina relacionada (opcional)</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
                value={formData.machine_id}
                onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
              >
                <option value="">Ninguno (equipo nuevo)</option>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name} ({machine.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Purchase Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.purchase_cost}
                  onChange={(e) => setFormData({ ...formData, purchase_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Est. Annual Savings ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.estimated_annual_savings}
                  onChange={(e) => setFormData({ ...formData, estimated_annual_savings: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {formData.estimated_annual_savings > 0 && formData.purchase_cost > 0 && (
              <div className="p-3 bg-primary/10 rounded-md">
                <div className="text-sm font-medium">Estimated Payback Period</div>
                <div className="text-2xl font-bold text-primary">
                  {Math.ceil((formData.purchase_cost / (formData.estimated_annual_savings / 12)))} months
                </div>
              </div>
            )}

            <div>
              <Label>Estado</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="proposal">Propuesta</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="completed">Completado</option>
              </select>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Justificación, beneficios esperados, cronograma..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsOpen(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={handleSubmit}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Investment Proposals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Propuestas de inversión en equipos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-medium">Equipo</th>
                  <th className="text-left py-2 px-4 font-medium">Related To</th>
                  <th className="text-right py-2 px-4 font-medium">Costo de compra</th>
                  <th className="text-right py-2 px-4 font-medium">Annual Savings</th>
                  <th className="text-right py-2 px-4 font-medium">Payback Period</th>
                  <th className="text-center py-2 px-4 font-medium">Estado</th>
                  <th className="text-center py-2 px-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((investment) => (
                  <tr key={investment.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-4 font-semibold">{investment.equipment_name}</td>
                    <td className="py-2 px-4">{investment.machines?.name || 'New Equipment'}</td>
                    <td className="py-2 px-4 text-right font-semibold text-destructive">
                      ${Math.round(investment.purchase_cost).toLocaleString('es-CL')}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-green-500">
                      ${Math.round(investment.estimated_annual_savings ?? 0).toLocaleString('es-CL')}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {investment.payback_period_months ? (
                        <div className="flex items-center justify-end gap-1">
                          <Clock className="h-4 w-4" />
                          {investment.payback_period_months} months
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2 px-4 text-center">
                      <Badge className={getStatusColor(investment.status || 'proposal')}>
                        {investment.status || 'proposal'}
                      </Badge>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(investment)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {investment.status === 'proposal' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatus(investment.id, 'approved')}
                              className="text-green-500"
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatus(investment.id, 'rejected')}
                              className="text-red-500"
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
