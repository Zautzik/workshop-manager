'use client';
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface CreateOTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateOTDialog({ open, onOpenChange, onSuccess }: CreateOTDialogProps) {
  const [formData, setFormData] = useState({
    ot_number: "",
    client_name: "",
    description: "",
    quantity: "",
    priority: "1",
    deadline: "",
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const response = await fetch('/api/ots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ot_number: formData.ot_number,
        client_name: formData.client_name,
        description: formData.description || null,
        quantity: parseInt(formData.quantity) || 0,
        priority: parseInt(formData.priority) || 1,
        deadline: formData.deadline || null,
        status: 'pre_press',
      }),
    });

    setLoading(false);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      toast({
        title: "Error al crear OT",
        description: errorBody?.error || 'Request failed',
        variant: "destructive",
      });
      return;
    }

    toast({ title: "OT creada correctamente" });
    setFormData({
      ot_number: "",
      client_name: "",
      description: "",
      quantity: "",
      priority: "1",
      deadline: "",
    });
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Crear nueva orden de trabajo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="ot_number">OT Number *</Label>
            <Input
              id="ot_number"
              required
              value={formData.ot_number}
              onChange={(e) => setFormData({ ...formData, ot_number: e.target.value })}
              className="bg-input border-border"
              placeholder="OT-2024-001"
            />
          </div>

          <div>
            <Label htmlFor="client_name">Client Name *</Label>
            <Input
              id="client_name"
              required
              value={formData.client_name}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
              className="bg-input border-border"
              placeholder="Empresa del cliente"
            />
          </div>

          <div>
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-input border-border"
              placeholder="Breve descripción de la orden de trabajo..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                required
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="bg-input border-border"
                placeholder="1000"
              />
            </div>

            <div>
              <Label htmlFor="priority">Priority (1-10)</Label>
              <Input
                id="priority"
                type="number"
                min="1"
                max="10"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="bg-input border-border"
                placeholder="Mayor = más urgente"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="deadline">Deadline</Label>
            <Input
              id="deadline"
              type="datetime-local"
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
              className="bg-input border-border"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-primary hover:bg-primary/90"
            >
              {loading ? "Creating..." : "Create OT"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
