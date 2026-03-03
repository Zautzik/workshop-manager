'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Sparkles } from 'lucide-react';
import type { OTFormData, OTTemplate, OTFinishes } from '@/types/ot';
import { EMPTY_FINISHES } from '@/types/ot';

interface Props {
  form: OTFormData;
  updateForm: (patch: Partial<OTFormData>) => void;
}

export function TemplateSelector({ form, updateForm }: Props) {
  const [templates, setTemplates] = useState<OTTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/ot-templates');
        if (res.ok) {
          const data = await res.json();
          setTemplates(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) {
      updateForm({ template_id: '' });
      return;
    }

    const finishes: OTFinishes = {
      ...EMPTY_FINISHES,
      ...(tpl.finishes || {}),
    };

    updateForm({
      template_id: tpl.id,
      product_type: tpl.product_type || '',
      substrate_type: tpl.substrate_type || '',
      grammage_gsm: tpl.grammage_gsm || 150,
      width_cm: tpl.width_cm || 0,
      height_cm: tpl.height_cm || 0,
      color_front: tpl.color_front || 'cmyk',
      color_back: tpl.color_back || 'sin_impresion',
      finishes,
      pricing: {
        ...form.pricing,
        margin_pct: tpl.margin_pct ?? 10,
        increment_pct: tpl.increment_pct ?? 10,
        commission_pct: tpl.commission_pct ?? 1,
      },
    });
  };

  if (loading || templates.length === 0) return null;

  return (
    <div className="border border-dashed border-primary/30 rounded-lg p-3 bg-primary/5">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-primary">Plantilla Rápida</span>
      </div>
      <Select
        value={form.template_id || undefined}
        onValueChange={applyTemplate}
      >
        <SelectTrigger className="bg-input border-border">
          <SelectValue placeholder="Seleccionar plantilla..." />
        </SelectTrigger>
        <SelectContent>
          {templates.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <span className="font-medium">{tpl.name}</span>
                  {tpl.description && (
                    <span className="text-xs text-muted-foreground ml-2">
                      — {tpl.description}
                    </span>
                  )}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
