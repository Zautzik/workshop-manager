'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const InventoryManagement = () => {
  const { t } = useLanguage();
  const [items, setItems] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState({
    item_name: '',
    quantity: 0,
    cost_per_unit: 0,
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from('inventory' as any)
      .select('*')
      .order('item_name');
    
    if (error) {
      toast.error('Error loading inventory');
    } else {
      setItems(data || []);
    }
  };

  const handleSubmit = async () => {
    if (editingItem) {
      const { error } = await supabase
        .from('inventory' as any)
        .update(formData as any)
        .eq('id', editingItem.id);

      if (error) {
        toast.error('Error updating item');
      } else {
        toast.success('Item updated successfully');
        fetchItems();
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from('inventory' as any)
        .insert(formData as any);

      if (error) {
        toast.error('Error creating item');
      } else {
        toast.success('Item created successfully');
        fetchItems();
        resetForm();
      }
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm(t('confirmDelete'))) return;

    const { error } = await supabase
      .from('inventory' as any)
      .delete()
      .eq('id', itemId);

    if (error) {
      toast.error('Error deleting item');
    } else {
      toast.success('Item deleted successfully');
      fetchItems();
    }
  };

  const resetForm = () => {
    setFormData({
      item_name: '',
      quantity: 0,
      cost_per_unit: 0,
    });
    setEditingItem(null);
    setShowDialog(false);
  };

  const openEditDialog = (item: any) => {
    setEditingItem(item);
    setFormData({
      item_name: item.item_name,
      quantity: item.quantity,
      cost_per_unit: item.cost_per_unit,
    });
    setShowDialog(true);
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-primary">{t('inventoryManagement')}</CardTitle>
        <Button onClick={() => setShowDialog(true)} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          {t('addItem')}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('itemName')}</TableHead>
              <TableHead>{t('quantity')}</TableHead>
              <TableHead>{t('costPerUnit')}</TableHead>
              <TableHead>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.item_name}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>${item.cost_per_unit}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEditDialog(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDelete(item.id)}
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
              {editingItem ? t('editItem') : t('addItem')}
            </DialogTitle>
            <DialogDescription>
              {editingItem ? t('editItemDescription') : t('addItemDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item_name">{t('itemName')}</Label>
              <Input
                id="item_name"
                value={formData.item_name}
                onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">{t('quantity')}</Label>
              <Input
                id="quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost_per_unit">{t('costPerUnit')}</Label>
              <Input
                id="cost_per_unit"
                type="number"
                step="0.01"
                value={formData.cost_per_unit}
                onChange={(e) => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90">
              {editingItem ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default InventoryManagement;
