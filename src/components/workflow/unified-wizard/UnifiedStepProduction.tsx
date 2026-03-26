'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Factory, BookOpen, Layers } from 'lucide-react';
import { SUBSTRATE_TYPES } from '@/types/ot';
import type { OTTapa, OTItem, OTPliego } from '@/types/ot-production';
import type { UnifiedOTForm } from '@/types/ot-unified';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

export function UnifiedStepProduction({ form, updateForm }: Props) {
  /* ── Tapas helpers ──────────────────────────────────────────── */
  const addTapa = () => {
    const code = String.fromCharCode(65 + form.tapas.length); // A, B, C …
    const newTapa: OTTapa = {
      id: crypto.randomUUID(),
      code,
      destination: '',
      quantity: 0,
    };
    updateForm({ tapas: [...form.tapas, newTapa] });
  };

  const updateTapa = (id: string, patch: Partial<OTTapa>) => {
    updateForm({
      tapas: form.tapas.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  };

  const removeTapa = (id: string) => {
    updateForm({ tapas: form.tapas.filter((t) => t.id !== id) });
  };

  /* ── Items helpers ──────────────────────────────────────────── */
  const addItem = () => {
    const num = form.items.length + 1;
    const newItem: OTItem = {
      id: crypto.randomUUID(),
      item_number: num,
      description: '',
      a_imprimir: 0,
      papel: 'bond',
      grammage_grs: 140,
      sheet_width: 72,
      sheet_height: 102,
      hojas_sin_cortar: 0,
      pi_base: 0,
      pi_sobrante: 0,
      pliegos_a_maquina: 0,
      pliegos_count: 4,
    };
    updateForm({ items: [...form.items, newItem] });
  };

  const updateItem = (id: string, patch: Partial<OTItem>) => {
    updateForm({
      items: form.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  };

  const removeItem = (id: string) => {
    updateForm({ items: form.items.filter((i) => i.id !== id) });
  };

  /* ── Pliegos helpers ────────────────────────────────────────── */
  const addPliego = () => {
    const num = form.pliegos.length + 1;
    const newPliego: OTPliego = {
      id: crypto.randomUUID(),
      pliego_number: num,
      unid_pag: 0,
      tiro: 4,
      retiro: 4,
      description: '',
      tiraje: 0,
      sobrantes: 0,
      cantidad: 0,
    };
    updateForm({ pliegos: [...form.pliegos, newPliego] });
  };

  const updatePliego = (id: string, patch: Partial<OTPliego>) => {
    updateForm({
      pliegos: form.pliegos.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const removePliego = (id: string) => {
    updateForm({ pliegos: form.pliegos.filter((p) => p.id !== id) });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <Factory className="h-6 w-6 text-primary" />
          Detalle de Producción
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Información detallada para el equipo de producción
        </p>
      </div>

      {/* ── Production Description ─────────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Descripción del Producto
        </h3>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Descripción para producción</Label>
            <Textarea
              placeholder='Ej: "Libros para Pintar 5 Cambios (Solo Tapas)"'
              value={form.production_detail.production_description}
              onChange={(e) =>
                updateForm({
                  production_detail: {
                    ...form.production_detail,
                    production_description: e.target.value,
                  },
                })
              }
              className="bg-input border-border min-h-[60px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Formato</Label>
              <Input
                placeholder='Ej: 21.5 x 16 cms Cerrado / 21.5 x 32 cms Ext.'
                value={form.production_detail.formato}
                onChange={(e) =>
                  updateForm({
                    production_detail: {
                      ...form.production_detail,
                      formato: e.target.value,
                    },
                  })
                }
                className="bg-input border-border text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Acabado</Label>
              <Input
                placeholder='Ej: Dobladas / Corchetéadas. Cajas de 500 unid.'
                value={form.production_detail.acabado || ''}
                onChange={(e) =>
                  updateForm({
                    production_detail: {
                      ...form.production_detail,
                      acabado: e.target.value,
                    },
                  })
                }
                className="bg-input border-border text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tapas Spec</Label>
              <Input
                placeholder='Ej: Tapas 4/1 colores en Bond 140 grs'
                value={form.production_detail.tapas_spec || ''}
                onChange={(e) =>
                  updateForm({
                    production_detail: {
                      ...form.production_detail,
                      tapas_spec: e.target.value,
                    },
                  })
                }
                className="bg-input border-border text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Interior Spec</Label>
              <Input
                placeholder='Ej: Interior 1/1 colores en Bond 90 grs'
                value={form.production_detail.interior_spec || ''}
                onChange={(e) =>
                  updateForm({
                    production_detail: {
                      ...form.production_detail,
                      interior_spec: e.target.value,
                    },
                  })
                }
                className="bg-input border-border text-sm"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ── Tapas Distribution ─────────────────────────────────── */}
      <Card className="p-4 border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            📑 Distribución de Tapas
          </h3>
          <Button size="sm" variant="outline" onClick={addTapa}>
            <Plus className="h-3 w-3 mr-1" /> Agregar Tapa
          </Button>
        </div>

        {form.tapas.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Sin tapas configuradas. Agregue tapas si el producto tiene variantes de cubierta.
          </p>
        ) : (
          <div className="space-y-2">
            {form.tapas.map((tapa) => (
              <div
                key={tapa.id}
                className="flex items-center gap-2 bg-muted/30 rounded-lg p-2"
              >
                <Badge variant="secondary" className="font-mono w-8 justify-center">
                  {tapa.code}
                </Badge>
                <Input
                  placeholder="Destino / descripción"
                  value={tapa.destination}
                  onChange={(e) => updateTapa(tapa.id, { destination: e.target.value })}
                  className="bg-input border-border flex-1 h-8 text-sm"
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Cant."
                  value={tapa.quantity || ''}
                  onChange={(e) =>
                    updateTapa(tapa.id, { quantity: Number(e.target.value) })
                  }
                  className="bg-input border-border w-24 h-8 text-sm"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => removeTapa(tapa.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            <div className="text-xs text-muted-foreground text-right">
              Total tapas:{' '}
              <span className="font-bold text-foreground">
                {form.tapas.reduce((s, t) => s + t.quantity, 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Items (paper runs) ─────────────────────────────────── */}
      <Card className="p-4 border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Ítems de Impresión
          </h3>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus className="h-3 w-3 mr-1" /> Agregar Ítem
          </Button>
        </div>

        {form.items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Agregue ítems con los detalles de cada tirada de papel.
          </p>
        ) : (
          <div className="space-y-4">
            {form.items.map((item) => (
              <div
                key={item.id}
                className="bg-muted/20 rounded-lg p-3 space-y-3 border border-border/50"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Ítem #{item.item_number}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Quitar
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Descripción</Label>
                    <Input
                      placeholder='Ej: "Tapas 5 Motivos"'
                      value={item.description}
                      onChange={(e) =>
                        updateItem(item.id, { description: e.target.value })
                      }
                      className="bg-input border-border h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px]">A Imprimir</Label>
                    <Input
                      type="number"
                      min={0}
                      value={item.a_imprimir || ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          a_imprimir: Number(e.target.value),
                        })
                      }
                      className="bg-input border-border h-8 text-sm font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px]">Papel</Label>
                    <Select
                      value={item.papel as string}
                      onValueChange={(v) => updateItem(item.id, { papel: v })}
                    >
                      <SelectTrigger className="bg-input border-border h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBSTRATE_TYPES.map((st) => (
                          <SelectItem key={st.value} value={st.value}>
                            {st.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Gramaje</Label>
                    <Input
                      type="number"
                      value={item.grammage_grs || ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          grammage_grs: Number(e.target.value),
                        })
                      }
                      className="bg-input border-border h-7 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px]">Ancho Hoja</Label>
                    <Input
                      type="number"
                      value={item.sheet_width || ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          sheet_width: Number(e.target.value),
                        })
                      }
                      className="bg-input border-border h-7 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px]">Alto Hoja</Label>
                    <Input
                      type="number"
                      value={item.sheet_height || ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          sheet_height: Number(e.target.value),
                        })
                      }
                      className="bg-input border-border h-7 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px]">Hojas s/c</Label>
                    <Input
                      type="number"
                      value={item.hojas_sin_cortar || ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          hojas_sin_cortar: Number(e.target.value),
                        })
                      }
                      className="bg-input border-border h-7 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px]">Pliegos Máq.</Label>
                    <Input
                      type="number"
                      value={item.pliegos_a_maquina || ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          pliegos_a_maquina: Number(e.target.value),
                        })
                      }
                      className="bg-input border-border h-7 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px]"># Pliegos</Label>
                    <Input
                      type="number"
                      value={item.pliegos_count || ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          pliegos_count: Number(e.target.value),
                        })
                      }
                      className="bg-input border-border h-7 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Pliegos (Signatures) ───────────────────────────────── */}
      <Card className="p-4 border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">📄 Pliegos (Signaturas)</h3>
          <Button size="sm" variant="outline" onClick={addPliego}>
            <Plus className="h-3 w-3 mr-1" /> Agregar Pliego
          </Button>
        </div>

        {form.pliegos.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Agregue pliegos para detallar cada pasada de impresión.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Descripción</th>
                  <th className="px-2 py-1 text-center">Tiro</th>
                  <th className="px-2 py-1 text-center">Retiro</th>
                  <th className="px-2 py-1 text-right">Tiraje</th>
                  <th className="px-2 py-1 text-right">Sobrantes</th>
                  <th className="px-2 py-1 text-right">Cant.</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {form.pliegos.map((pl) => (
                  <tr key={pl.id} className="border-b border-border/30">
                    <td className="px-2 py-1">
                      <Badge variant="outline" className="text-[10px]">
                        {pl.pliego_number}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={pl.description}
                        onChange={(e) =>
                          updatePliego(pl.id, { description: e.target.value })
                        }
                        className="bg-input border-border h-7 text-xs"
                        placeholder="Desc."
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={pl.tiro || ''}
                        onChange={(e) =>
                          updatePliego(pl.id, { tiro: Number(e.target.value) })
                        }
                        className="bg-input border-border h-7 text-xs w-14 text-center"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={pl.retiro || ''}
                        onChange={(e) =>
                          updatePliego(pl.id, { retiro: Number(e.target.value) })
                        }
                        className="bg-input border-border h-7 text-xs w-14 text-center"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={pl.tiraje || ''}
                        onChange={(e) =>
                          updatePliego(pl.id, { tiraje: Number(e.target.value) })
                        }
                        className="bg-input border-border h-7 text-xs w-20 text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={pl.sobrantes || ''}
                        onChange={(e) =>
                          updatePliego(pl.id, {
                            sobrantes: Number(e.target.value),
                          })
                        }
                        className="bg-input border-border h-7 text-xs w-16 text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={pl.cantidad || ''}
                        onChange={(e) =>
                          updatePliego(pl.id, {
                            cantidad: Number(e.target.value),
                          })
                        }
                        className="bg-input border-border h-7 text-xs w-20 text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => removePliego(pl.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
