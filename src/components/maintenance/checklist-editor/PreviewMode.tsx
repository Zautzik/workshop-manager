'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Save } from 'lucide-react';
import { actionTypeMeta, frequencyLabel } from '@/lib/maintenance-checklist-meta';
import {
  groupItemsBySection, maintenanceTypeLabel, priorityColors, priorityLabel, SIN_SECCION,
  type MaintenanceChecklist,
} from './types';

export function PreviewMode({
  checklist,
  onBack,
  onSave,
}: {
  checklist: MaintenanceChecklist;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="border-2 border-emerald-500/50">
      <CardHeader className="bg-emerald-500/10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{checklist.name} - Vista previa</CardTitle>
            <CardDescription className="mt-2">
              Máquina: {checklist.machineType} | Tipo: {maintenanceTypeLabel[checklist.maintenanceType] ?? checklist.maintenanceType} | Frecuencia: {frequencyLabel(checklist.frequency)}
            </CardDescription>
          </div>
          <Button onClick={onBack} variant="outline">
            Volver a editar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="bg-emerald-500/10 p-6 rounded-lg space-y-4 print:bg-white">
          <div className="text-center mb-6 pb-6 border-b-2 border-emerald-500/30">
            <h1 className="text-2xl font-bold text-foreground mb-2">{checklist.name}</h1>
            <p className="text-muted-foreground mb-4">
              Máquina: {checklist.machineType} | Mantenimiento: {maintenanceTypeLabel[checklist.maintenanceType] ?? checklist.maintenanceType} | Frecuencia: {frequencyLabel(checklist.frequency)}
            </p>
            <div className="flex justify-center gap-6 text-sm">
              <div>
                <span className="font-semibold text-foreground">{checklist.items.length}</span>
                <p className="text-muted-foreground">Pasos</p>
              </div>
              <div>
                <span className="font-semibold text-foreground">{checklist.totalEstimatedTime}</span>
                <p className="text-muted-foreground">Minutos</p>
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  {new Date(checklist.updatedAt).toLocaleDateString('es-CL')}
                </span>
                <p className="text-muted-foreground">Última actualización</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {groupItemsBySection(checklist.items).map((group) => (
              <div key={group.section} className="space-y-4 page-break-inside-avoid">
                {group.section !== SIN_SECCION && (
                  <h2 className="border-b border-border pb-1 text-sm font-bold uppercase tracking-wide text-foreground">
                    {group.section}
                  </h2>
                )}
                {group.items.map((item) => (
                  <div key={item.id} className="border-l-4 border-primary pl-4 py-3 page-break-inside-avoid">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-primary text-primary-foreground rounded-full font-bold text-sm">
                          {item.step}
                        </div>
                        <h3 className="font-bold text-foreground">{item.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.actionType && (() => {
                          const meta = actionTypeMeta(item.actionType);
                          const Icon = meta.icon;
                          return (
                            <Badge className={meta.className} variant="outline">
                              <Icon className="mr-1 h-3 w-3" />
                              {meta.label.toUpperCase()}
                            </Badge>
                          );
                        })()}
                        <Badge className={priorityColors[item.priority]} variant="outline">
                          {priorityLabel[item.priority].toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    {item.description && (
                      <p className="text-foreground/90 mb-2 ml-11 whitespace-pre-wrap">{item.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 ml-11 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock size={14} />
                        {item.estimatedTime} min
                      </div>

                      {item.toolsRequired.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Herramientas:</span>
                          <span className="text-foreground font-medium">
                            {item.toolsRequired.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 ml-11 flex items-center gap-2 p-2 bg-muted rounded">
                      <input type="checkbox" className="w-4 h-4 cursor-pointer" />
                      <span className="text-sm text-muted-foreground">Completado</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t-2 border-border text-sm text-muted-foreground">
            <p>Técnico: _________________________</p>
            <p>Fecha: _________________________</p>
            <p>Notas: ___________________________________</p>
          </div>
        </div>

        <div className="mt-6 flex gap-2 justify-center">
          <Button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            🖨️ Imprimir checklist
          </Button>
          <Button
            onClick={onSave}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save size={16} className="mr-2" />
            Guardar y cerrar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
