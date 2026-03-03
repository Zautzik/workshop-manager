/**
 * @fileoverview Inventory Management Component
 * 
 * SYSTEM ROLE: Material & Supply Inventory Controller
 * ORGAN ANALOGY: The "Warehouse Manager" - Tracks all materials and supplies
 * 
 * Provides complete inventory management interface:
 * - Display list of all items in inventory table
 * - Add new inventory items with name, quantity, cost per unit
 * - Edit existing items
 * - Delete items from inventory
 * - Real-time updates to Supabase database
 * - Automatic sorting by item name
 * - Toast notifications for user feedback
 * 
 * Data Management:
 * - Reads/writes to 'inventory' table in database
 * - Tracks item_name, quantity, cost_per_unit
 * - Maintains inventory count for procurement decisions
 * 
 * Admin-only component, shown in Admin Dashboard.
 */
'use client';
import { useMemo, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, AlertTriangle, Calculator, Boxes } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useInventoryItems,
  useInventoryLots,
  useInventoryTransactions,
  useInventoryLowStockAlerts,
  useOTs,
} from '@/hooks/use-queries';

const CATEGORY_OPTIONS = [
  { value: 'tool', label: 'Tools' },
  { value: 'supply', label: 'Supplies' },
  { value: 'product_input', label: 'Product Inputs' },
  { value: 'spare_part', label: 'Spare Parts' },
];

const TX_OPTIONS = [
  { value: 'purchase', label: 'Purchase (+)' },
  { value: 'consumption', label: 'Consumption (-)' },
  { value: 'adjustment_in', label: 'Adjustment In (+)' },
  { value: 'adjustment_out', label: 'Adjustment Out (-)' },
  { value: 'return_to_stock', label: 'Return to Stock (+)' },
];

const getCategoryLabel = (value?: string | null) => {
  const found = CATEGORY_OPTIONS.find((option) => option.value === value);
  return found?.label || value || '-';
};

const InventoryManagement = () => {
  const { t } = useLanguage();
  const { data: items = [], refetch: refetchItems } = useInventoryItems();
  const { data: lots = [], refetch: refetchLots } = useInventoryLots();
  const { data: transactions = [], refetch: refetchTransactions } = useInventoryTransactions();
  const { data: alerts = [] } = useInventoryLowStockAlerts();
  const { data: ots = [] } = useOTs();

  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showLotDialog, setShowLotDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [itemForm, setItemForm] = useState({
    sku: '',
    name: '',
    category: 'tool',
    unit: 'unit',
    min_stock: 0,
    estimated_unit_cost: 0,
    is_certification_required: false,
    is_active: true,
    notes: '',
  });

  const [lotForm, setLotForm] = useState({
    item_id: '',
    lot_number: '',
    certification_code: '',
    certification_expires_on: '',
    supplier_name: '',
    received_date: '',
    unit_cost: 0,
    quantity_received: 0,
    quantity_available: 0,
  });

  const [txForm, setTxForm] = useState({
    item_id: '',
    lot_id: '',
    tx_type: 'consumption',
    quantity: 0,
    unit_cost: 0,
    work_order_id: '',
    reference_code: '',
    notes: '',
  });

  const [calculator, setCalculator] = useState({
    item_id: '',
    quantity: 0,
  });

  const filteredItems = useMemo(() => {
    if (categoryFilter === 'all') return items;
    return items.filter((item: any) => item.category === categoryFilter);
  }, [items, categoryFilter]);

  const totalStockValue = useMemo(() => {
    return items.reduce((sum: number, item: any) => {
      const stock = Number(item.current_stock || 0);
      const cost = Number(item.weighted_unit_cost || item.estimated_unit_cost || 0);
      return sum + stock * cost;
    }, 0);
  }, [items]);

  const estimatedSelection = useMemo(() => {
    const selected = items.find((item: any) => item.id === calculator.item_id);
    if (!selected) return null;
    const unitCost = Number(selected.weighted_unit_cost || selected.estimated_unit_cost || 0);
    const quantity = Number(calculator.quantity || 0);
    return {
      name: selected.name,
      unit: selected.unit,
      unitCost,
      quantity,
      total: unitCost * quantity,
      stock: Number(selected.current_stock || 0),
    };
  }, [calculator, items]);

  const filteredLots = useMemo(() => {
    if (!txForm.item_id) return lots;
    return lots.filter((lot: any) => lot.item_id === txForm.item_id);
  }, [lots, txForm.item_id]);

  const refetchAllInventoryData = () => {
    refetchItems();
    refetchLots();
    refetchTransactions();
  };

  const resetItemForm = () => {
    setItemForm({
      sku: '',
      name: '',
      category: 'tool',
      unit: 'unit',
      min_stock: 0,
      estimated_unit_cost: 0,
      is_certification_required: false,
      is_active: true,
      notes: '',
    });
    setEditingItem(null);
    setShowItemDialog(false);
  };

  const resetLotForm = () => {
    setLotForm({
      item_id: '',
      lot_number: '',
      certification_code: '',
      certification_expires_on: '',
      supplier_name: '',
      received_date: '',
      unit_cost: 0,
      quantity_received: 0,
      quantity_available: 0,
    });
    setShowLotDialog(false);
  };

  const resetTxForm = () => {
    setTxForm({
      item_id: '',
      lot_id: '',
      tx_type: 'consumption',
      quantity: 0,
      unit_cost: 0,
      work_order_id: '',
      reference_code: '',
      notes: '',
    });
    setShowTxDialog(false);
  };

  const handleSaveItem = async () => {
    if (!itemForm.sku.trim() || !itemForm.name.trim()) {
      toast.error('SKU and name are required');
      return;
    }

    const payload = {
      ...itemForm,
      sku: itemForm.sku.trim(),
      name: itemForm.name.trim(),
    };

    if (editingItem) {
      const { error } = await supabase
        .from('inventory_items' as any)
        .update(payload as any)
        .eq('id', editingItem.id);

      if (error) {
        toast.error(error.message || 'Error updating item');
      } else {
        toast.success('Item updated successfully');
        refetchAllInventoryData();
        resetItemForm();
      }
    } else {
      const { error } = await supabase
        .from('inventory_items' as any)
        .insert(payload as any);

      if (error) {
        toast.error(error.message || 'Error creating item');
      } else {
        toast.success('Item created successfully');
        refetchAllInventoryData();
        resetItemForm();
      }
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm(t('confirmDelete'))) return;

    const { error } = await supabase
      .from('inventory_items' as any)
      .delete()
      .eq('id', itemId);

    if (error) {
      toast.error(error.message || 'Error deleting item');
    } else {
      toast.success('Item deleted successfully');
      refetchAllInventoryData();
    }
  };

  const handleCreateLot = async () => {
    if (!lotForm.item_id || !lotForm.lot_number.trim()) {
      toast.error('Item and lot number are required');
      return;
    }

    const { error } = await supabase
      .from('inventory_lots' as any)
      .insert({
        ...lotForm,
        lot_number: lotForm.lot_number.trim(),
        certification_code: lotForm.certification_code || null,
        certification_expires_on: lotForm.certification_expires_on || null,
        supplier_name: lotForm.supplier_name || null,
        received_date: lotForm.received_date || new Date().toISOString().split('T')[0],
      } as any);

    if (error) {
      toast.error(error.message || 'Error creating lot');
      return;
    }

    toast.success('Lot created successfully');
    refetchAllInventoryData();
    resetLotForm();
  };

  const openEditDialog = (item: any) => {
    setEditingItem(item);
    setItemForm({
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      min_stock: Number(item.min_stock || 0),
      estimated_unit_cost: Number(item.estimated_unit_cost || 0),
      is_certification_required: Boolean(item.is_certification_required),
      is_active: Boolean(item.is_active),
      notes: item.notes || '',
    });
    setShowItemDialog(true);
  };

  const handleCreateTransaction = async () => {
    if (!txForm.item_id || !txForm.lot_id || Number(txForm.quantity) <= 0) {
      toast.error('Item, lot and positive quantity are required');
      return;
    }

    if (txForm.tx_type === 'consumption' && !txForm.work_order_id) {
      toast.error('Work order is required for consumption');
      return;
    }

    const payload = {
      item_id: txForm.item_id,
      lot_id: txForm.lot_id,
      tx_type: txForm.tx_type,
      quantity: Number(txForm.quantity),
      unit_cost: Number(txForm.unit_cost) > 0 ? Number(txForm.unit_cost) : null,
      work_order_id: txForm.work_order_id || null,
      reference_code: txForm.reference_code || null,
      notes: txForm.notes || null,
    };

    const { error } = await supabase
      .from('inventory_stock_transactions' as any)
      .insert(payload as any);

    if (error) {
      toast.error(error.message || 'Error creating stock transaction');
      return;
    }

    toast.success('Stock transaction registered');
    refetchAllInventoryData();
    resetTxForm();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-primary flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Total Inventory SKUs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{items.length}</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-primary">Estimated Stock Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${totalStockValue.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Low-Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{alerts.length}</p>
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Low-Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert: any) => (
                <div key={alert.id} className="flex items-center justify-between rounded-md border border-destructive/30 p-2">
                  <div>
                    <p className="font-medium">{alert.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getCategoryLabel(alert.category)} • Stock: {Number(alert.current_stock).toFixed(3)} / Min: {Number(alert.min_stock).toFixed(3)}
                    </p>
                  </div>
                  <Badge variant="destructive">{String(alert.severity || 'medium').toUpperCase()}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-primary">Inventory Module</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="items" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="lots">Lots</TabsTrigger>
              <TabsTrigger value="transactions">Stock Transactions</TabsTrigger>
              <TabsTrigger value="calculator">Cost Estimator</TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="space-y-4">
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORY_OPTIONS.map((category) => (
                      <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button onClick={() => setShowItemDialog(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Min Stock</TableHead>
                    <TableHead>Avg Cost</TableHead>
                    <TableHead>{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{getCategoryLabel(item.category)}</TableCell>
                      <TableCell>{Number(item.current_stock || 0).toFixed(3)} {item.unit}</TableCell>
                      <TableCell>{Number(item.min_stock || 0).toFixed(3)} {item.unit}</TableCell>
                      <TableCell>${Number(item.weighted_unit_cost || item.estimated_unit_cost || 0).toFixed(4)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="lots" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowLotDialog(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lot
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Certification</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Unit Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.map((lot: any) => (
                    <TableRow key={lot.id}>
                      <TableCell>{lot.inventory_items?.name || '-'}</TableCell>
                      <TableCell>{lot.lot_number}</TableCell>
                      <TableCell>{lot.certification_code || '-'}</TableCell>
                      <TableCell>{lot.certification_expires_on || '-'}</TableCell>
                      <TableCell>{Number(lot.quantity_available || 0).toFixed(3)}</TableCell>
                      <TableCell>${Number(lot.unit_cost || 0).toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowTxDialog(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Transaction
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Estimated Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                      <TableCell>{tx.tx_type}</TableCell>
                      <TableCell>{tx.item_name}</TableCell>
                      <TableCell>{tx.lot_number || '-'}</TableCell>
                      <TableCell>{Number(tx.quantity).toFixed(3)} {tx.unit}</TableCell>
                      <TableCell>{tx.ot_number ? `${tx.ot_number} (${tx.client_name || 'No client'})` : '-'}</TableCell>
                      <TableCell>${Number(tx.estimated_total_cost || 0).toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="calculator" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Estimated Cost Calculator
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Inventory item</Label>
                      <Select
                        value={calculator.item_id}
                        onValueChange={(value) => setCalculator((prev) => ({ ...prev, item_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((item: any) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.sku} - {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={calculator.quantity}
                        onChange={(e) => setCalculator((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                      />
                    </div>
                  </div>

                  {estimatedSelection && (
                    <div className="rounded-md border p-3 bg-muted/30 text-sm">
                      <p><strong>Item:</strong> {estimatedSelection.name}</p>
                      <p><strong>Available stock:</strong> {estimatedSelection.stock.toFixed(3)} {estimatedSelection.unit}</p>
                      <p><strong>Estimated unit cost:</strong> ${estimatedSelection.unitCost.toFixed(4)}</p>
                      <p className="text-base font-semibold mt-2">
                        Estimated total: ${estimatedSelection.total.toFixed(4)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Inventory Item' : 'Create Inventory Item'}</DialogTitle>
            <DialogDescription>
              CRUD for tools, supplies, product inputs, and spare parts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={itemForm.category} onValueChange={(value) => setItemForm({ ...itemForm, category: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((category) => (
                      <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Minimum Stock</Label>
                <Input type="number" step="0.001" value={itemForm.min_stock} onChange={(e) => setItemForm({ ...itemForm, min_stock: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Estimated Unit Cost</Label>
                <Input type="number" step="0.0001" value={itemForm.estimated_unit_cost} onChange={(e) => setItemForm({ ...itemForm, estimated_unit_cost: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetItemForm}>{t('cancel')}</Button>
            <Button onClick={handleSaveItem}>{editingItem ? t('update') : t('create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLotDialog} onOpenChange={setShowLotDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Lot</DialogTitle>
            <DialogDescription>
              Register batch/lot data for certification traceability and costing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Item</Label>
              <Select value={lotForm.item_id} onValueChange={(value) => setLotForm({ ...lotForm, item_id: value })}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {items.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>{item.sku} - {item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Lot Number</Label>
                <Input value={lotForm.lot_number} onChange={(e) => setLotForm({ ...lotForm, lot_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input value={lotForm.supplier_name} onChange={(e) => setLotForm({ ...lotForm, supplier_name: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Certification Code</Label>
                <Input value={lotForm.certification_code} onChange={(e) => setLotForm({ ...lotForm, certification_code: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Certification Expiry</Label>
                <Input type="date" value={lotForm.certification_expires_on} onChange={(e) => setLotForm({ ...lotForm, certification_expires_on: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Received Qty</Label>
                <Input type="number" step="0.001" value={lotForm.quantity_received} onChange={(e) => setLotForm({ ...lotForm, quantity_received: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Available Qty</Label>
                <Input type="number" step="0.001" value={lotForm.quantity_available} onChange={(e) => setLotForm({ ...lotForm, quantity_available: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost</Label>
                <Input type="number" step="0.0001" value={lotForm.unit_cost} onChange={(e) => setLotForm({ ...lotForm, unit_cost: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetLotForm}>{t('cancel')}</Button>
            <Button onClick={handleCreateLot}>Create Lot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTxDialog} onOpenChange={setShowTxDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Stock Transaction</DialogTitle>
            <DialogDescription>
              Track stock movements and link consumption to work orders.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Item</Label>
                <Select
                  value={txForm.item_id}
                  onValueChange={(value) => setTxForm({ ...txForm, item_id: value, lot_id: '' })}
                >
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {items.map((item: any) => (
                      <SelectItem key={item.id} value={item.id}>{item.sku} - {item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transaction Type</Label>
                <Select value={txForm.tx_type} onValueChange={(value) => setTxForm({ ...txForm, tx_type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TX_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Lot</Label>
                <Select value={txForm.lot_id} onValueChange={(value) => setTxForm({ ...txForm, lot_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Select lot" /></SelectTrigger>
                  <SelectContent>
                    {filteredLots.map((lot: any) => (
                      <SelectItem key={lot.id} value={lot.id}>
                        {lot.lot_number} (avail {Number(lot.quantity_available || 0).toFixed(3)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" step="0.001" value={txForm.quantity} onChange={(e) => setTxForm({ ...txForm, quantity: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unit Cost (optional)</Label>
                <Input type="number" step="0.0001" value={txForm.unit_cost} onChange={(e) => setTxForm({ ...txForm, unit_cost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Work Order (required for consumption)</Label>
                <Select value={txForm.work_order_id} onValueChange={(value) => setTxForm({ ...txForm, work_order_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Select OT" /></SelectTrigger>
                  <SelectContent>
                    {ots.map((ot: any) => (
                      <SelectItem key={ot.id} value={ot.id}>{ot.ot_number} - {ot.client_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reference code</Label>
              <Input value={txForm.reference_code} onChange={(e) => setTxForm({ ...txForm, reference_code: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetTxForm}>{t('cancel')}</Button>
            <Button onClick={handleCreateTransaction}>Create Transaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryManagement;
