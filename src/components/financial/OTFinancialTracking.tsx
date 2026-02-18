'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DollarSign, TrendingUp, TrendingDown, Plus, Edit2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useOTFinancials, useOTs } from '@/hooks/use-queries';

interface OTFinancial {
  id: string;
  ot_id: string;
  material_cost: number | null;
  labor_cost: number | null;
  machine_cost: number | null;
  energy_cost: number | null;
  outsourcing_cost: number | null;
  overhead_cost: number | null;
  hours_spent: number | null;
  total_cost: number | null;
  revenue: number | null;
  profit: number | null;
  notes: string | null;
  ot?: {
    ot_number: string;
    client_name: string;
  };
}

export const OTFinancialTracking = () => {
  const { data: financials = [], refetch: refetchFinancials } = useOTFinancials();
  const { data: ots = [], refetch: refetchOts } = useOTs();
  const [selectedOtId, setSelectedOtId] = useState('');
  const [formData, setFormData] = useState({
    material_cost: 0,
    labor_cost: 0,
    machine_cost: 0,
    energy_cost: 0,
    outsourcing_cost: 0,
    overhead_cost: 0,
    hours_spent: 0,
    revenue: 0,
    notes: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async () => {
    if (!selectedOtId && !editingId) {
      toast.error('Please select an OT');
      return;
    }

    const payload = {
      ot_id: editingId ? undefined : selectedOtId,
      ...formData
    };

    if (editingId) {
      const { error } = await supabase
        .from('ot_financials')
        .update(payload)
        .eq('id', editingId);

      if (error) {
        toast.error('Error updating financial data');
        return;
      }
      toast.success('Financial data updated successfully');
    } else {
      const { error } = await supabase
        .from('ot_financials')
        .insert([payload] as any);

      if (error) {
        toast.error('Error adding financial data');
        return;
      }
      toast.success('Financial data added successfully');
    }

    setIsOpen(false);
    resetForm();
    refetchFinancials();
    refetchOts();
  };

  const resetForm = () => {
    setFormData({
      material_cost: 0,
      labor_cost: 0,
      machine_cost: 0,
      energy_cost: 0,
      outsourcing_cost: 0,
      overhead_cost: 0,
      hours_spent: 0,
      revenue: 0,
      notes: ''
    });
    setSelectedOtId('');
    setEditingId(null);
  };

  const handleEdit = (financial: OTFinancial) => {
    setFormData({
      material_cost: financial.material_cost ?? 0,
      labor_cost: financial.labor_cost ?? 0,
      machine_cost: financial.machine_cost ?? 0,
      energy_cost: financial.energy_cost ?? 0,
      outsourcing_cost: financial.outsourcing_cost ?? 0,
      overhead_cost: financial.overhead_cost ?? 0,
      hours_spent: financial.hours_spent ?? 0,
      revenue: financial.revenue ?? 0,
      notes: financial.notes || ''
    });
    setEditingId(financial.id);
    setIsOpen(true);
  };

  const totalRevenue = financials.reduce((sum, f) => sum + (f.revenue ?? 0), 0);
  const totalCost = financials.reduce((sum, f) => sum + (f.total_cost ?? 0), 0);
  const totalProfit = financials.reduce((sum, f) => sum + (f.profit ?? 0), 0);
  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">${totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">${totalCost.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className={totalProfit >= 0 ? 'border-green-500/20' : 'border-red-500/20'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'} flex items-center gap-2`}>
              {totalProfit >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
              ${totalProfit.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profit Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-accent">{profitMargin}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => { resetForm(); setIsOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add OT Financial Data
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add'} OT Financial Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingId && (
              <div>
                <Label>Select OT</Label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
                  value={selectedOtId}
                  onChange={(e) => setSelectedOtId(e.target.value)}
                >
                  <option value="">Select an OT...</option>
                  {ots.map((ot) => (
                    <option key={ot.id} value={ot.id}>
                      {ot.ot_number} - {ot.client_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Time-based costs section */}
            <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
              <h4 className="font-semibold mb-3 text-blue-700 dark:text-blue-300 flex items-center gap-2">
                ⏱️ Time-Based Costs
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Hours Spent</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={formData.hours_spent}
                    onChange={(e) => setFormData({ ...formData, hours_spent: parseFloat(e.target.value) || 0 })}
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
                  <Label>Energy Cost / Electricity ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.energy_cost}
                    onChange={(e) => setFormData({ ...formData, energy_cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Machine Usage Cost ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.machine_cost}
                    onChange={(e) => setFormData({ ...formData, machine_cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            {/* Supply-based costs section */}
            <div className="border rounded-lg p-4 bg-purple-50 dark:bg-purple-950/20">
              <h4 className="font-semibold mb-3 text-purple-700 dark:text-purple-300 flex items-center gap-2">
                📦 Supply-Based Costs
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Materials (Ink, Paper, etc.) ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.material_cost}
                    onChange={(e) => setFormData({ ...formData, material_cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Outsourced Services ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.outsourcing_cost}
                    onChange={(e) => setFormData({ ...formData, outsourcing_cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Overhead Cost ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.overhead_cost}
                    onChange={(e) => setFormData({ ...formData, overhead_cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Revenue ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.revenue}
                onChange={(e) => setFormData({ ...formData, revenue: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSubmit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* OT Financials Table */}
      <Card>
        <CardHeader>
          <CardTitle>OT Financial Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-medium">OT Number</th>
                  <th className="text-left py-2 px-4 font-medium">Client</th>
                  <th className="text-right py-2 px-4 font-medium">Hours</th>
                  <th className="text-right py-2 px-4 font-medium text-blue-600">Time Costs</th>
                  <th className="text-right py-2 px-4 font-medium text-purple-600">Supply Costs</th>
                  <th className="text-right py-2 px-4 font-medium">Total Cost</th>
                  <th className="text-right py-2 px-4 font-medium">Revenue</th>
                  <th className="text-right py-2 px-4 font-medium">Profit</th>
                  <th className="text-right py-2 px-4 font-medium">Margin %</th>
                  <th className="text-center py-2 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {financials.map((financial) => {
                  const revenue = financial.revenue ?? 0;
                  const profit = financial.profit ?? 0;
                  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
                  const timeCosts = (financial.labor_cost ?? 0) + (financial.energy_cost ?? 0) + (financial.machine_cost ?? 0);
                  const supplyCosts = (financial.material_cost ?? 0) + (financial.outsourcing_cost ?? 0) + (financial.overhead_cost ?? 0);
                  
                  return (
                    <tr key={financial.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-4">{financial.ot?.ot_number}</td>
                      <td className="py-2 px-4">{financial.ot?.client_name}</td>
                      <td className="py-2 px-4 text-right font-medium text-blue-600">
                        {financial.hours_spent || 0}h
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-blue-600">
                        ${timeCosts.toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-purple-600">
                        ${supplyCosts.toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-destructive">
                        ${(financial.total_cost ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-primary">
                        ${revenue.toFixed(2)}
                      </td>
                      <td className={`py-2 px-4 text-right font-bold ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${profit.toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-right">{margin}%</td>
                      <td className="py-2 px-4 text-center">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(financial)}>
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
    </div>
  );
};
