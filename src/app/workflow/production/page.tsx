/**
 * @fileoverview Production OT Creation Page
 *
 * Two-step flow:
 *   1. Work Type Selector — pick the product category (Etiqueta, Libro, etc.)
 *   2. Production OT Form — pre-filled with category-specific defaults
 */
'use client';

import { useState } from 'react';
import ProductionOTFormComponent from '@/components/workflow/ProductionOTForm';
import WorkTypeSelector from '@/components/workflow/WorkTypeSelector';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { OTProductionForm } from '@/types/ot-production';
import type { WorkCategoryKey } from '@/types/work-category';

export default function ProductionOTPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<WorkCategoryKey | null>(null);

  const handleSave = (form: OTProductionForm) => {
    try {
      const existing = JSON.parse(localStorage.getItem('production_ots') || '[]');
      existing.push({
        ...form,
        id: crypto.randomUUID?.() ?? Date.now().toString(),
        created_at: new Date().toISOString(),
        status: 'pendiente',
        work_category: selectedCategory,
      });
      localStorage.setItem('production_ots', JSON.stringify(existing));

      toast({
        title: 'OT Guardada',
        description: `Orden de Trabajo ${form.ot_number} guardada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la OT.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    if (selectedCategory) {
      // Go back to category selector
      setSelectedCategory(null);
    } else {
      router.back();
    }
  };

  // Step 1: Work type selection
  if (!selectedCategory) {
    return (
      <div className="min-h-screen bg-background">
        <WorkTypeSelector
          onSelect={(cat) => setSelectedCategory(cat)}
          onCancel={() => router.back()}
        />
      </div>
    );
  }

  // Step 2: Production form pre-filled with category defaults
  return (
    <div className="min-h-screen bg-background">
      <ProductionOTFormComponent
        workCategory={selectedCategory}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
