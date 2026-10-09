'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const COST_MODEL_EXPANDED_STORAGE_KEY = 'workflow_cost_model_expanded';

const defaultCostModel = {
  name: 'Default Cost Model',
  cost_weight: '1',
  rating_weight: '0',
  skill_weight: '0',
  overtime_multiplier_50: '',
  overtime_multiplier_100: '',
  night_shift_multiplier: '',
  weekend_multiplier: '',
  minimum_hourly_rate: '',
  maximum_hourly_rate: '',
  rounding_increment: '0.01',
  prefer_lower_cost: true,
};

const toNumberOrNull = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
};

export function CostModelPanel({
  costModel,
  refetchCostModel,
}: {
  costModel: any;
  refetchCostModel: () => void;
}) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [savingCostModel, setSavingCostModel] = useState(false);
  const [costModelError, setCostModelError] = useState<string | null>(null);
  const [costModelForm, setCostModelForm] = useState(defaultCostModel);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COST_MODEL_EXPANDED_STORAGE_KEY);
      if (!raw) return;
      setIsExpanded(raw === 'true');
    } catch {
      // ignore local storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COST_MODEL_EXPANDED_STORAGE_KEY, String(isExpanded));
    } catch {
      // ignore local storage errors
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!costModel) return;
    setCostModelForm({
      name: costModel.name || 'Cost Model',
      cost_weight: String(costModel.cost_weight ?? '1'),
      rating_weight: String(costModel.rating_weight ?? '0'),
      skill_weight: String(costModel.skill_weight ?? '0'),
      overtime_multiplier_50: costModel.overtime_multiplier_50 === null ? '' : String(costModel.overtime_multiplier_50),
      overtime_multiplier_100: costModel.overtime_multiplier_100 === null ? '' : String(costModel.overtime_multiplier_100),
      night_shift_multiplier: costModel.night_shift_multiplier === null ? '' : String(costModel.night_shift_multiplier),
      weekend_multiplier: costModel.weekend_multiplier === null ? '' : String(costModel.weekend_multiplier),
      minimum_hourly_rate: costModel.minimum_hourly_rate === null ? '' : String(costModel.minimum_hourly_rate),
      maximum_hourly_rate: costModel.maximum_hourly_rate === null ? '' : String(costModel.maximum_hourly_rate),
      rounding_increment: String(costModel.rounding_increment ?? '0.01'),
      prefer_lower_cost: Boolean(costModel.prefer_lower_cost ?? true),
    });
  }, [costModel]);

  const handleSaveCostModel = async () => {
    setSavingCostModel(true);
    setCostModelError(null);

    const payload = {
      name: costModelForm.name || 'Cost Model',
      is_active: true,
      cost_weight: Number(costModelForm.cost_weight || 0),
      rating_weight: Number(costModelForm.rating_weight || 0),
      skill_weight: Number(costModelForm.skill_weight || 0),
      overtime_multiplier_50: toNumberOrNull(costModelForm.overtime_multiplier_50),
      overtime_multiplier_100: toNumberOrNull(costModelForm.overtime_multiplier_100),
      night_shift_multiplier: toNumberOrNull(costModelForm.night_shift_multiplier),
      weekend_multiplier: toNumberOrNull(costModelForm.weekend_multiplier),
      minimum_hourly_rate: toNumberOrNull(costModelForm.minimum_hourly_rate),
      maximum_hourly_rate: toNumberOrNull(costModelForm.maximum_hourly_rate),
      rounding_increment: Number(costModelForm.rounding_increment || 0.01),
      prefer_lower_cost: Boolean(costModelForm.prefer_lower_cost),
    };

    try {
      // Through the API, not browser-direct: RLS silently rejected these writes
      // under dev-bypass, so the model looked saved and never was.
      const res = costModel?.id
        ? await fetch(`/api/scheduling-cost-models?id=${encodeURIComponent(costModel.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          })
        : await fetch('/api/scheduling-cost-models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo guardar el modelo de costos');
      }

      toast({
        title: 'Modelo de costos guardado',
        description: 'La programación usará la configuración actualizada del modelo de costos.',
      });
      refetchCostModel();
    } catch (error: any) {
      setCostModelError(error.message || 'No se pudo guardar el modelo de costos');
      toast({
        title: 'No se pudo guardar el modelo de costos',
        description: error.message || 'Revisa los valores e intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSavingCostModel(false);
    }
  };

  return (
    <Card className="bg-card/80 border-border backdrop-blur-sm p-4 mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">Modelo de costos</h3>
          <p className="text-sm text-muted-foreground">
            Customize how cost, rating, and skill weights rank assignments.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="border-border bg-card/50 hover:bg-card"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-4 max-h-[50vh] overflow-y-auto pr-1">
          <div className="flex items-center justify-end mb-4">
            <Button
              onClick={handleSaveCostModel}
              disabled={savingCostModel}
              className="bg-primary hover:bg-primary/90"
            >
              {savingCostModel ? 'Saving...' : 'Save Cost Model'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="cost-model-name">Nombre del modelo</Label>
              <Input
                id="cost-model-name"
                value={costModelForm.name}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="cost-weight">Peso del costo</Label>
              <Input
                id="cost-weight"
                type="number"
                step="0.1"
                value={costModelForm.cost_weight}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, cost_weight: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="rating-weight">Peso de la calificación</Label>
              <Input
                id="rating-weight"
                type="number"
                step="0.1"
                value={costModelForm.rating_weight}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, rating_weight: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="skill-weight">Peso de la habilidad</Label>
              <Input
                id="skill-weight"
                type="number"
                step="0.1"
                value={costModelForm.skill_weight}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, skill_weight: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="ot-multiplier">OT 50% Multiplier</Label>
              <Input
                id="ot-multiplier"
                type="number"
                step="0.01"
                value={costModelForm.overtime_multiplier_50}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, overtime_multiplier_50: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="ot-multiplier-100">OT 100% Multiplier</Label>
              <Input
                id="ot-multiplier-100"
                type="number"
                step="0.01"
                value={costModelForm.overtime_multiplier_100}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, overtime_multiplier_100: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="night-multiplier">Night Shift Multiplier</Label>
              <Input
                id="night-multiplier"
                type="number"
                step="0.01"
                value={costModelForm.night_shift_multiplier}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, night_shift_multiplier: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="weekend-multiplier">Weekend Multiplier</Label>
              <Input
                id="weekend-multiplier"
                type="number"
                step="0.01"
                value={costModelForm.weekend_multiplier}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, weekend_multiplier: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="min-rate">Tarifa mínima por hora</Label>
              <Input
                id="min-rate"
                type="number"
                step="0.01"
                value={costModelForm.minimum_hourly_rate}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, minimum_hourly_rate: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="max-rate">Maximum Hourly Rate</Label>
              <Input
                id="max-rate"
                type="number"
                step="0.01"
                value={costModelForm.maximum_hourly_rate}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, maximum_hourly_rate: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="rounding">Rounding Increment</Label>
              <Input
                id="rounding"
                type="number"
                step="0.01"
                value={costModelForm.rounding_increment}
                onChange={(event) =>
                  setCostModelForm((prev) => ({ ...prev, rounding_increment: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={costModelForm.prefer_lower_cost}
                onCheckedChange={(checked) =>
                  setCostModelForm((prev) => ({ ...prev, prefer_lower_cost: checked }))
                }
              />
              <Label>Preferir menor costo</Label>
            </div>
            {costModelError && (
              <p className="text-sm text-destructive">{costModelError}</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
