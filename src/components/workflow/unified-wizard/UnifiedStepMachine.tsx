'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Cog, Printer, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MACHINE_TYPES, PAYMENT_CATEGORIES, type OTMachineType } from '@/types/ot-production';
import type { UnifiedOTForm } from '@/types/ot-unified';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

const COLOR_CONFIGS = [
  '1/0', '1/1', '2/0', '2/1', '2/2',
  '4/0', '4/1', '4/2', '4/4',
];

export function UnifiedStepMachine({ form, updateForm }: Props) {
  const updateMachine = (patch: Partial<UnifiedOTForm['machine']>) => {
    updateForm({ machine: { ...form.machine, ...patch } });
  };

  const updateAdmin = (patch: Partial<UnifiedOTForm['admin']>) => {
    updateForm({ admin: { ...form.admin, ...patch } });
  };

  const updateFinishing = (patch: Partial<UnifiedOTForm['finishing']>) => {
    updateForm({ finishing: { ...form.finishing, ...patch } });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <Cog className="h-6 w-6 text-primary" />
          Máquina y Terminación
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Configuración de impresión, acabados y datos administrativos
        </p>
      </div>

      {/* ── Machine Config ─────────────────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Printer className="h-4 w-4 text-primary" />
          Máquina de Impresión
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="col-span-2 space-y-2">
            <Label className="text-xs">Tipo de Máquina</Label>
            <Select
              value={form.machine.machine_type}
              onValueChange={(v) =>
                updateMachine({ machine_type: v as OTMachineType })
              }
            >
              <SelectTrigger className="bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MACHINE_TYPES.map((mt) => (
                  <SelectItem key={mt.value} value={mt.value}>
                    {mt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Config. Color</Label>
            <div className="grid grid-cols-3 gap-1">
              {COLOR_CONFIGS.map((cc) => (
                <button
                  key={cc}
                  type="button"
                  onClick={() => updateMachine({ color_config: cc })}
                  className={cn(
                    'rounded border p-1.5 text-xs font-mono transition-all',
                    form.machine.color_config === cc
                      ? 'border-primary bg-primary/10 text-foreground font-bold'
                      : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {cc}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Tiraje</Label>
            <Input
              type="number"
              value={form.machine.tiraje || ''}
              onChange={(e) =>
                updateMachine({ tiraje: Number(e.target.value) })
              }
              placeholder="Ej: 5000"
              className="bg-input border-border font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={form.machine.ctp_needed}
              onCheckedChange={(v) => updateMachine({ ctp_needed: v })}
            />
            <Label className="text-xs">CTP Necesario</Label>
          </div>

          {form.machine.ctp_needed && (
            <div className="space-y-1">
              <Label className="text-[10px]">Placas CTP</Label>
              <Input
                type="number"
                value={form.machine.ctp_count || ''}
                onChange={(e) =>
                  updateMachine({ ctp_count: Number(e.target.value) })
                }
                className="bg-input border-border h-8 text-sm font-mono"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              checked={form.machine.vb_pdf}
              onCheckedChange={(v) => updateMachine({ vb_pdf: v })}
            />
            <Label className="text-xs flex items-center gap-1">
              <FileCheck className="h-3 w-3" />
              V°B° PDF
            </Label>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Colores Especiales</Label>
            <Input
              value={form.machine.colores_especiales || ''}
              onChange={(e) =>
                updateMachine({ colores_especiales: e.target.value })
              }
              placeholder="Ej: Pantone 186 C"
              className="bg-input border-border h-8 text-sm"
            />
          </div>
        </div>
      </Card>

      {/* ── Finishing / Encuadernación ─────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm">🔧 Encuadernación y Terminación</h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { key: 'corte_resma' as const, label: 'Corte Resma' },
            { key: 'corte_final' as const, label: 'Corte Final' },
            { key: 'doblados' as const, label: 'Doblados' },
            { key: 'corchetes' as const, label: 'Corchetes' },
            { key: 'cajas' as const, label: 'Cajas' },
            { key: 'despacho_gonsa' as const, label: 'Despacho Gonsa' },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-2 bg-muted/20 rounded-lg p-2.5">
              <Switch
                checked={form.finishing[item.key]}
                onCheckedChange={(v) =>
                  updateFinishing({ [item.key]: v })
                }
              />
              <Label className="text-xs">{item.label}</Label>
            </div>
          ))}
        </div>

        {/* Quantity fields for active finishing options */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {form.finishing.corte_resma && (
            <div className="space-y-1">
              <Label className="text-[10px]">Cant. Corte Resma</Label>
              <Input
                type="number"
                value={form.finishing.corte_resma_qty || ''}
                onChange={(e) =>
                  updateFinishing({ corte_resma_qty: Number(e.target.value) })
                }
                className="bg-input border-border h-7 text-xs font-mono"
              />
            </div>
          )}
          {form.finishing.corte_final && (
            <div className="space-y-1">
              <Label className="text-[10px]">Cant. Corte Final</Label>
              <Input
                type="number"
                value={form.finishing.corte_final_qty || ''}
                onChange={(e) =>
                  updateFinishing({ corte_final_qty: Number(e.target.value) })
                }
                className="bg-input border-border h-7 text-xs font-mono"
              />
            </div>
          )}
          {form.finishing.doblados && (
            <div className="space-y-1">
              <Label className="text-[10px]">Cant. Doblados</Label>
              <Input
                type="number"
                value={form.finishing.doblados_qty || ''}
                onChange={(e) =>
                  updateFinishing({ doblados_qty: Number(e.target.value) })
                }
                className="bg-input border-border h-7 text-xs font-mono"
              />
            </div>
          )}
          {form.finishing.cajas && (
            <div className="space-y-1">
              <Label className="text-[10px]">Cant. Cajas</Label>
              <Input
                type="number"
                value={form.finishing.cajas_qty || ''}
                onChange={(e) =>
                  updateFinishing({ cajas_qty: Number(e.target.value) })
                }
                className="bg-input border-border h-7 text-xs font-mono"
              />
            </div>
          )}
        </div>
      </Card>

      {/* ── Admin / Administrative Data ────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm">📋 Datos Administrativos</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Solicitante</Label>
            <Input
              value={form.admin.solicitante}
              onChange={(e) =>
                updateAdmin({ solicitante: e.target.value })
              }
              placeholder="Nombre del solicitante"
              className="bg-input border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Vendedor</Label>
            <Input
              value={form.admin.vendedor}
              onChange={(e) => updateAdmin({ vendedor: e.target.value })}
              placeholder="Nombre del vendedor"
              className="bg-input border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Categoría de Pago</Label>
            <Select
              value={form.admin.categoria_pago}
              onValueChange={(v) => updateAdmin({ categoria_pago: v })}
            >
              <SelectTrigger className="bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_CATEGORIES.map((pc) => (
                  <SelectItem key={pc.value} value={pc.value}>
                    {pc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">RUT</Label>
            <Input
              value={form.admin.rut || ''}
              onChange={(e) => updateAdmin({ rut: e.target.value })}
              placeholder="12.345.678-9"
              className="bg-input border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">N° Presupuesto</Label>
            <Input
              value={form.admin.presupuesto_numero || ''}
              onChange={(e) =>
                updateAdmin({ presupuesto_numero: e.target.value })
              }
              className="bg-input border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Orden de Compra</Label>
            <Input
              value={form.admin.orden_compra || ''}
              onChange={(e) =>
                updateAdmin({ orden_compra: e.target.value })
              }
              className="bg-input border-border"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
