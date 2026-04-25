'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePurchases } from '@/hooks/use-admin-queries';

const PurchasesManagement = () => {
  const { t } = useLanguage();
  const { data: purchases = [], refetch: refetchPurchases } = usePurchases();
  const [showDialog, setShowDialog] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [formData, setFormData] = useState({
    supplier: '',
    purchase_date: new Date().toISOString().split('T')[0],
    certification_details: '',
    total_cost: 0,
  });

  const handleSubmit = async () => {
    if (editingPurchase) {
      const { error } = await supabase
        .from('purchases' as any)
        .update(formData as any)
        .eq('id', editingPurchase.id);

      if (error) {
        toast.error('Error updating purchase');
      } else {
        toast.success('Purchase updated successfully');
        refetchPurchases();
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from('purchases' as any)
        .insert(formData as any);

      if (error) {
        toast.error('Error creating purchase');
      } else {
        toast.success('Purchase created successfully');
        refetchPurchases();
        resetForm();
      }
    }
  };

  const handleDelete = async (purchaseId: string) => {
    if (!confirm(t('confirmDelete'))) return;

    const { error } = await supabase
      .from('purchases' as any)
      .delete()
      .eq('id', purchaseId);

    if (error) {
      toast.error('Error deleting purchase');
    } else {
      toast.success('Purchase deleted successfully');
      refetchPurchases();
    }
  };

  const resetForm = () => {
    setFormData({
      supplier: '',
      purchase_date: new Date().toISOString().split('T')[0],
      certification_details: '',
      total_cost: 0,
    });
    setEditingPurchase(null);
    setShowDialog(false);
  };

  const openEditDialog = (purchase: any) => {
    setEditingPurchase(purchase);
    setFormData({
      supplier: purchase.supplier,
      purchase_date: new Date(purchase.purchase_date).toISOString().split('T')[0],
      certification_details: purchase.certification_details || '',
      total_cost: purchase.total_cost,
    });
    setShowDialog(true);
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-primary">{t('purchasesManagement')}</CardTitle>
        <Button onClick={() => setShowDialog(true)} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          {t('addPurchase')}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('supplier')}</TableHead>
              <TableHead>{t('date')}</TableHead>
              <TableHead>{t('totalCost')}</TableHead>
              <TableHead>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((purchase) => (
              <TableRow key={purchase.id}>
                <TableCell>{purchase.supplier}</TableCell>
                <TableCell>{new Date(purchase.purchase_date).toLocaleDateString()}</TableCell>
                <TableCell>${purchase.total_cost}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEditDialog(purchase)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDelete(purchase.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPurchase ? t('editPurchase') : t('addPurchase')}
            </DialogTitle>
            <DialogDescription>
              {editingPurchase ? t('editPurchaseDescription') : t('addPurchaseDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supplier">{t('supplier')}</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchase_date">{t('date')}</Label>
              <Input
                id="purchase_date"
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_cost">{t('totalCost')}</Label>
              <Input
                id="total_cost"
                type="number"
                step="0.01"
                value={formData.total_cost}
                onChange={(e) => setFormData({ ...formData, total_cost: parseFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certification_details">{t('certificationDetails')}</Label>
              <Textarea
                id="certification_details"
                value={formData.certification_details}
                onChange={(e) => setFormData({ ...formData, certification_details: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90">
              {editingPurchase ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PurchasesManagement;
