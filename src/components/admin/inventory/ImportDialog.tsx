'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { familyStyle, getMaterialKindLabel } from './constants';

export function ImportDialog({
  open,
  onOpenChange,
  onCancel,
  importPreview,
  importResult,
  importLoading,
  importError,
  onFileChange,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  importPreview: any;
  importResult: any;
  importLoading: boolean;
  importError: string | null;
  onFileChange: (file: File | null) => void;
  onCommit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar Excel de inventario</DialogTitle>
          <DialogDescription>
            El export mensual del sistema anterior — se identifica por Código; los ítems nuevos se crean con un
            lote de apertura, los que ya existen sólo actualizan nombre, clasificación, mínimo y costo. El stock
            de ítems existentes nunca se toca automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!importResult && (
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              disabled={importLoading}
            />
          )}

          {importLoading && <p className="text-sm text-muted-foreground">Procesando…</p>}
          {importError && <p className="text-sm text-destructive">{importError}</p>}

          {importPreview && !importResult && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400">
                  {importPreview.summary.new} nuevos
                </span>
                <span className="rounded-full bg-sky-500/10 px-2.5 py-1 font-medium text-sky-600 dark:text-sky-400">
                  {importPreview.summary.updated} actualizados
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  {importPreview.summary.unchanged} sin cambios
                </span>
                {importPreview.summary.stockDiffers > 0 && (
                  <span
                    className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600 dark:text-amber-400"
                    title="El Excel reporta un stock distinto al del sistema — no se ajusta automáticamente, revisar manualmente."
                  >
                    {importPreview.summary.stockDiffers} con diferencia de stock
                  </span>
                )}
              </div>

              {importPreview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                  {importPreview.warnings.map((w: string, i: number) => <p key={i}>{w}</p>)}
                </div>
              )}

              <div className="max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">Código</th>
                      <th className="p-2">Nombre</th>
                      <th className="p-2">Familia</th>
                      <th className="p-2">Estado</th>
                      <th className="p-2 text-right">Stock Excel</th>
                      <th className="p-2 text-right">Stock actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r: any) => (
                      <tr key={r.sku} className="border-b last:border-0">
                        <td className="p-2 font-mono">{r.sku}</td>
                        <td className="p-2 max-w-[220px] truncate" title={r.name}>{r.name}</td>
                        <td className="p-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] ${familyStyle(r.materialKind).chip}`}>
                            {getMaterialKindLabel(r.materialKind)}
                          </span>
                          {r.categoriaUnmapped && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400" title="Categoría sin mapeo conocido">
                              ⚠
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {r.status === 'new' && <span className="text-emerald-600 dark:text-emerald-400">Nuevo</span>}
                          {r.status === 'updated' && (
                            <span className="text-sky-600 dark:text-sky-400" title={r.changes.join(', ')}>
                              Actualiza {r.changes.join(', ')}
                            </span>
                          )}
                          {r.status === 'unchanged' && <span className="text-muted-foreground">Sin cambios</span>}
                        </td>
                        <td className="p-2 text-right font-mono">{r.excelStock.toLocaleString('es-CL')}</td>
                        <td className={`p-2 text-right font-mono ${r.stockDiffers ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}`}>
                          {r.currentStock == null ? '—' : r.currentStock.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importResult && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400">
                  {importResult.created} creados
                </span>
                <span className="rounded-full bg-sky-500/10 px-2.5 py-1 font-medium text-sky-600 dark:text-sky-400">
                  {importResult.updated} actualizados
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  {importResult.unchanged} sin cambios
                </span>
                {importResult.errors.length > 0 && (
                  <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                    {importResult.errors.length} con error
                  </span>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  {importResult.errors.map((e: string, i: number) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {importResult ? 'Cerrar' : 'Cancelar'}
          </Button>
          {importPreview && !importResult && (
            <Button onClick={onCommit} disabled={importLoading} className="bg-primary hover:bg-primary/90">
              Confirmar importación
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
