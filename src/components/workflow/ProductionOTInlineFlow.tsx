'use client';

import { useState } from 'react';
import WorkTypeSelector from '@/components/workflow/WorkTypeSelector';
import ProductionOTFormComponent from '@/components/workflow/ProductionOTForm';
import { useToast } from '@/hooks/use-toast';
import type { OTProductionForm } from '@/types/ot-production';
import type { WorkCategoryKey } from '@/types/work-category';

/* ================================================================ */
/*  Inline Production OT Flow — used inside OTManagement overlay    */
/*  Two-step: WorkTypeSelector → ProductionOTForm                   */
/*  On submit, creates the OT via the API so it enters the Kanban   */
/* ================================================================ */

interface ProductionOTInlineFlowProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductionOTInlineFlow({ onClose, onSuccess }: ProductionOTInlineFlowProps) {
  const [selectedCategory, setSelectedCategory] = useState<WorkCategoryKey | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async (form: OTProductionForm) => {
    setSaving(true);
    try {
      // 1. Generate OT number from the API
      const numberRes = await fetch('/api/ots/generate-number');
      const { ot_number } = await numberRes.json();

      // 2. Map production form → Kanban OT payload
      //    We store the rich production data in `notes` as JSON
      //    and the essential fields go to the ots table directly
      const payload = {
        ot_number: form.ot_number || ot_number,
        client_name: form.client_name || 'Sin cliente',
        product_name: form.trabajo || form.production_detail?.production_description || '',
        description: form.production_detail?.production_description || null,
        quantity: form.cantidad_total || 0,
        priority_level: form.priority_level || 'normal',
        deadline: form.fecha_entrega || null,
        status: 'pre_press',
        // Map what we can to existing fields
        product_type: mapCategoryToProductType(selectedCategory),
        substrate_type: form.production_detail?.tapas_spec?.toLowerCase().includes('couche') ? 'couche'
          : form.production_detail?.tapas_spec?.toLowerCase().includes('bond') ? 'bond'
          : form.production_detail?.tapas_spec?.toLowerCase().includes('cartulina') ? 'cartulina'
          : null,
        // Store full production data as JSON in notes for later retrieval
        notes: JSON.stringify({
          _type: 'production_ot',
          work_category: selectedCategory,
          production_form: form,
        }),
      };

      const response = await fetch('/api/ots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.error || 'Error al crear la OT de producción');
      }

      // Also save to localStorage for the OT Producción retrieval tab
      try {
        const existing = JSON.parse(localStorage.getItem('production_ots') || '[]');
        existing.push({
          ...form,
          ot_number: form.ot_number || ot_number,
          id: crypto.randomUUID?.() ?? Date.now().toString(),
          created_at: new Date().toISOString(),
          status: 'pendiente',
          work_category: selectedCategory,
        });
        localStorage.setItem('production_ots', JSON.stringify(existing));
      } catch {
        // localStorage save is nice-to-have, not critical
      }

      toast({
        title: 'OT de Producción creada',
        description: `Orden ${form.ot_number || ot_number} registrada y visible en el tablero.`,
      });
      onSuccess();
    } catch (err: any) {
      toast({
        title: 'Error al crear la OT',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else {
      onClose();
    }
  };

  // Step 1: Category selection
  if (!selectedCategory) {
    return (
      <WorkTypeSelector
        onSelect={(cat) => setSelectedCategory(cat)}
        onCancel={onClose}
      />
    );
  }

  // Step 2: Production form
  return (
    <ProductionOTFormComponent
      workCategory={selectedCategory}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}

/* ─── Helper: Map WorkCategoryKey → OTProductType ─────────────── */
function mapCategoryToProductType(category: WorkCategoryKey | null): string | null {
  if (!category) return null;
  const map: Record<string, string> = {
    etiqueta: 'etiqueta',
    estuche: 'caja_plegadiza',
    afiche: 'afiche',
    cajas: 'caja_display',
    diptico: 'brochure',
    triptico: 'brochure',
    revista: 'otro',
    libro: 'otro',
    sobre: 'sobre',
    tarjeta: 'otro',
    volante: 'volante',
    carpeta: 'carpeta',
    bolsa: 'bolsa',
    calendario: 'otro',
  };
  return map[category] || 'otro';
}
