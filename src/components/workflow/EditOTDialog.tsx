'use client';
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface EditOTDialogProps {
  ot: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const STATUS_OPTIONS = [
  { value: 'pre_press', label: 'Pre-Press (Design)' },
  { value: 'visto_bueno', label: 'Visto Bueno (Approval)' },
  { value: 'paper_purchase', label: 'Compras' },
  { value: 'in_storage', label: 'In Storage' },
  { value: 'guillotine_first_cut', label: 'First Cut' },
  { value: 'offset_printing', label: 'Offset Printing' },
  { value: 'die_cutting', label: 'Die Cutting' },
  { value: 'guillotine_final_cut', label: 'Final Cut' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'outsourced', label: 'Outsourced' },
  { value: 'workshop_revision', label: 'Workshop Revision' },
  { value: 'ready_for_delivery', label: 'Ready for Delivery' },
  { value: 'in_delivery', label: 'In Delivery' },
  { value: 'completed', label: 'Completed' },
];

export function EditOTDialog({ ot, open, onOpenChange, onSuccess }: EditOTDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    ot_number: "",
    client_name: "",
    description: "",
    quantity: 0,
    priority: 1,
    status: "pre_press",
    deadline: "",
  });

  useEffect(() => {
    if (ot) {
      setFormData({
        ot_number: ot.ot_number || "",
        client_name: ot.client_name || "",
        description: ot.description || "",
        quantity: ot.quantity || 0,
        priority: ot.priority || 1,
        status: ot.status || "pre_press",
        deadline: ot.deadline ? new Date(ot.deadline).toISOString().split('T')[0] : "",
      });
    }
  }, [ot]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updateData: any = {
        ot_number: formData.ot_number,
        client_name: formData.client_name,
        description: formData.description,
        quantity: formData.quantity,
        priority: formData.priority,
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
      };

      const response = await fetch(`/api/ots/${ot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || 'Request failed');
      }

      const statusChanged = ot?.status && ot.status !== formData.status;
      if (statusChanged) {
        const transitionRes = await fetch(`/api/ots/${ot.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to_status: formData.status,
            reason: 'manual_edit_dialog',
          }),
        });

        if (!transitionRes.ok) {
          const transitionError = await transitionRes.json().catch(() => null);
          throw new Error(transitionError?.error || 'Status transition failed');
        }
      }

      toast({
        title: "OT actualizada correctamente",
        description: `${formData.ot_number} has been updated`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error al actualizar OT",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-foreground">Editar orden de trabajo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ot_number">OT Number*</Label>
              <Input
                id="ot_number"
                value={formData.ot_number}
                onChange={(e) => setFormData({ ...formData, ot_number: e.target.value })}
                className="bg-input border-border"
                required
              />
            </div>

            <div>
              <Label htmlFor="client_name">Client Name*</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                className="bg-input border-border"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-input border-border"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity*</Label>
              <Input
                id="quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                className="bg-input border-border"
                required
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="priority">Priority (1-10)*</Label>
              <Input
                id="priority"
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                className="bg-input border-border"
                required
                min="1"
                max="10"
              />
            </div>

            <div>
              <Label htmlFor="deadline">Deadline</Label>
              <Input
                id="deadline"
                type="date"
                value={formData.deadline}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                className="bg-input border-border"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="status">Status*</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger className="bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? "Updating..." : "Update OT"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
