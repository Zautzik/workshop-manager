'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Search,
  FileText,
  Printer,
  Eye,
  Download,
  Calendar,
  Filter,
  Plus,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import type { OTProductionForm } from '@/types/ot-production';
import { generateProductionOTPDF } from '@/lib/ot-production-pdf';
import ProductionOTFormComponent from './ProductionOTForm';

/* ================================================================ */
/*  OT Retrieval & PDF Download System                              */
/* ================================================================ */

interface OTListItem {
  id: string;
  ot_number: string;
  client_name: string;
  trabajo: string;
  cantidad_total: number;
  fecha_ot: string;
  fecha_entrega: string;
  priority_level: string;
  status: string;
  /** Full production form data (loaded on demand) */
  production_data?: OTProductionForm;
}

type SortField = 'ot_number' | 'client_name' | 'fecha_ot' | 'fecha_entrega' | 'cantidad_total';
type SortDir = 'asc' | 'desc';

/* ─── Sample data for demo ───────────────────────────────────── */
const SAMPLE_OTS: OTListItem[] = [
  {
    id: '1',
    ot_number: '38945',
    client_name: 'RBS IMPRESORES SPA',
    trabajo: 'Libros para Pintar 5 Motivos',
    cantidad_total: 6500,
    fecha_ot: '2025-05-23',
    fecha_entrega: '2025-06-02',
    priority_level: 'alta',
    status: 'en_produccion',
    production_data: {
      ot_number: '38945',
      ot_anterior: '',
      fecha_ot: '2025-05-23',
      fecha_entrega: '2025-06-02',
      client_name: 'RBS IMPRESORES SPA',
      client_id: '',
      trabajo: 'Libros para Pintar 5 Motivos',
      cantidad_total: 6500,
      unidades_label: 'UNIDADES',
      priority_level: 'alta',
      production_detail: {
        production_description: 'Libros para Pintar 5 Cambios (Solo Tapas)',
        formato: '21.5 x 16 cms Cerrado / 21.5 x 32 cms Ext.',
        tapas_spec: 'Tapas (5 Motivos) 4/1 colores en Bond 140 grs',
        interior_spec: 'Interior (Común) 1/1 colores en Bond 90 grs',
        acabado: 'Dobladas / Corchetéadas. Cajas de 500 unid.',
      },
      tapas: [
        { id: '1', code: 'A', destination: 'PUMAHUE', quantity: 3500 },
        { id: '2', code: 'B', destination: 'MANGUECURA PONIENTE', quantity: 1500 },
        { id: '3', code: 'C', destination: 'MANGUECURA ORIENTE', quantity: 500 },
        { id: '4', code: 'D', destination: 'ABS', quantity: 500 },
        { id: '5', code: 'E', destination: 'TGS', quantity: 500 },
      ],
      items: [{
        id: '1',
        item_number: 1,
        description: 'Tapas 5 Motivos',
        a_imprimir: 6500,
        papel: 'bond',
        grammage_grs: 140,
        sheet_width: 72,
        sheet_height: 102,
        hojas_sin_cortar: 842,
        pi_base: 3250,
        pi_sobrante: 120,
        pliegos_a_maquina: 3370,
        pliegos_count: 4,
      }],
      montaje: {
        paginas_total: 2,
        forma_extension: '21.5 x 32',
        montaje_grid: '1 x 2',
        pliego_a_maquina: '33 x 48',
        pinza_cm: 0.8,
        corte_hoja: '1/4 Normal',
        montaje_paginas: 2,
      },
      machine: {
        machine_type: 'impresion_digital',
        color_config: '4/4',
        tiraje: 3370,
        ctp_needed: false,
        vb_pdf: true,
      },
      process_summary: {
        description: 'ALZADO DIGITAL / 2 CORCHETES / CAJAS DE 500 UNIDADES',
      },
      pliegos: [
        { id: '1', pliego_number: 1, unid_pag: 4, tiro: 4, retiro: 1, description: 'TAPAS A', tiraje: 1750, sobrantes: 50, cantidad: 3500 },
        { id: '2', pliego_number: 2, unid_pag: 4, tiro: 4, retiro: 1, description: 'TAPAS B', tiraje: 750, sobrantes: 25, cantidad: 1500 },
        { id: '3', pliego_number: 3, unid_pag: 4, tiro: 4, retiro: 1, description: 'TAPAS C', tiraje: 250, sobrantes: 20, cantidad: 500 },
        { id: '4', pliego_number: 4, unid_pag: 4, tiro: 4, retiro: 1, description: 'TAPAS D - E', tiraje: 500, sobrantes: 25, cantidad: 500, nota: '500 C/U' },
      ],
      finishing: {
        corte_resma: false,
        corte_final: false,
        doblados: false,
        corchetes: true,
        cajas: true,
        cajas_qty: 33,
        despacho_gonsa: false,
      },
      admin: {
        solicitante: 'Roberto Brusoni',
        vendedor: 'Juan Pavez',
        telefono: '976996885',
        rut: '52001121-8',
        presupuesto_numero: '193881 A',
        categoria_pago: 'B : CRÉDITO 30 DÍAS',
        notas_produccion: '',
        originales_via: 'Originales x Mail',
      },
    },
  },
];

/* ─── Status badge colors ────────────────────────────────────── */
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  borrador: { label: 'Borrador', variant: 'outline' },
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  aprobada: { label: 'Aprobada', variant: 'default' },
  en_produccion: { label: 'En Producción', variant: 'default' },
  terminada: { label: 'Terminada', variant: 'secondary' },
  entregada: { label: 'Entregada', variant: 'outline' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  baja: { label: 'Baja', color: 'text-blue-500' },
  normal: { label: 'Normal', color: 'text-green-500' },
  alta: { label: 'Alta', color: 'text-amber-500' },
  urgente: { label: 'Urgente', color: 'text-red-500' },
};

/* ================================================================ */

export default function OTRetrievalSystem() {
  /* ─── State ──────────────────────────────────────────────── */
  const [otList, setOtList] = useState<OTListItem[]>(SAMPLE_OTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<SortField>('fecha_ot');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedOT, setSelectedOT] = useState<OTListItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 20;

  /* ─── Filtering & sorting ────────────────────────────────── */
  const filtered = useMemo(() => {
    let result = [...otList];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (ot) =>
          ot.ot_number.toLowerCase().includes(q) ||
          ot.client_name.toLowerCase().includes(q) ||
          ot.trabajo.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((ot) => ot.status === statusFilter);
    }

    // Date range
    if (dateFrom) result = result.filter((ot) => ot.fecha_ot >= dateFrom);
    if (dateTo) result = result.filter((ot) => ot.fecha_ot <= dateTo);

    // Sorting
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = typeof aVal === 'number'
        ? (aVal as number) - (bVal as number)
        : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [otList, searchQuery, statusFilter, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  /* ─── Actions ────────────────────────────────────────────── */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handlePrintOT = (ot: OTListItem) => {
    if (ot.production_data) {
      generateProductionOTPDF(ot.production_data);
    }
  };

  const handlePreview = (ot: OTListItem) => {
    setSelectedOT(ot);
    setPreviewOpen(true);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleNewOTSave = (formData: OTProductionForm) => {
    const newItem: OTListItem = {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      ot_number: formData.ot_number,
      client_name: formData.client_name,
      trabajo: formData.trabajo,
      cantidad_total: formData.cantidad_total,
      fecha_ot: formData.fecha_ot,
      fecha_entrega: formData.fecha_entrega,
      priority_level: formData.priority_level,
      status: 'pendiente',
      production_data: formData,
    };
    setOtList((prev) => [newItem, ...prev]);
    setCreateOpen(false);
  };

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <div className="space-y-4 p-4">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Órdenes de Trabajo</h1>
          <p className="text-sm text-muted-foreground">
            Buscar, consultar e imprimir órdenes de trabajo de producción
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Nueva OT Producción
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva Orden de Trabajo</DialogTitle>
            </DialogHeader>
            <ProductionOTFormComponent
              onSave={handleNewOTSave}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* ═══ FILTERS ═══ */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  placeholder="N° OT, cliente, trabajo..."
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
              </div>
              <Button variant="ghost" size="icon" onClick={handleResetFilters} title="Limpiar filtros">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ RESULTS TABLE ═══ */}
      <Card>
        <CardContent className="pt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 cursor-pointer" onClick={() => handleSort('ot_number')}>
                    <div className="flex items-center gap-1">
                      OT <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('client_name')}>
                    <div className="flex items-center gap-1">
                      Cliente <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead>Trabajo</TableHead>
                  <TableHead className="w-24 cursor-pointer text-right" onClick={() => handleSort('cantidad_total')}>
                    <div className="flex items-center gap-1 justify-end">
                      Cantidad <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="w-28 cursor-pointer" onClick={() => handleSort('fecha_ot')}>
                    <div className="flex items-center gap-1">
                      Fecha OT <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="w-28 cursor-pointer" onClick={() => handleSort('fecha_entrega')}>
                    <div className="flex items-center gap-1">
                      Entrega <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="w-24">Estado</TableHead>
                  <TableHead className="w-32 text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No se encontraron órdenes de trabajo
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((ot) => {
                    const status = STATUS_MAP[ot.status] || { label: ot.status, variant: 'outline' as const };
                    const priority = PRIORITY_MAP[ot.priority_level];
                    return (
                      <TableRow key={ot.id} className="hover:bg-muted/50">
                        <TableCell className="font-bold">{ot.ot_number}</TableCell>
                        <TableCell className="font-medium">{ot.client_name}</TableCell>
                        <TableCell className="text-sm">{ot.trabajo}</TableCell>
                        <TableCell className="text-right font-mono">
                          {ot.cantidad_total.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(ot.fecha_ot).toLocaleDateString('es-CL')}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {new Date(ot.fecha_entrega).toLocaleDateString('es-CL')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handlePreview(ot)}
                              title="Vista previa"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handlePrintOT(ot)}
                              title="Imprimir PDF"
                              disabled={!ot.production_data}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} de {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ PREVIEW DIALOG ═══ */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>OT {selectedOT?.ot_number} — {selectedOT?.client_name}</span>
              {selectedOT?.production_data && (
                <Button size="sm" onClick={() => handlePrintOT(selectedOT!)}>
                  <Printer className="h-4 w-4 mr-1" />
                  Imprimir PDF
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedOT && (
            <OTPreviewCard ot={selectedOT} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================================================ */
/*  OT Preview Card — Shows all production details inline           */
/* ================================================================ */

function OTPreviewCard({ ot }: { ot: OTListItem }) {
  const data = ot.production_data;
  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Sin datos de producción disponibles para esta OT
      </div>
    );
  }

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('es-CL'); } catch { return d; }
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Header info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
        <div>
          <div className="text-xs text-muted-foreground">OT</div>
          <div className="font-bold text-lg">{data.ot_number}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Cliente</div>
          <div className="font-semibold">{data.client_name}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Fecha OT</div>
          <div>{fmtDate(data.fecha_ot)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Entrega</div>
          <div className="font-bold text-red-600">{fmtDate(data.fecha_entrega)}</div>
        </div>
      </div>

      {/* Production detail */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs uppercase text-muted-foreground">Detalle de Producción</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-1">
          <p className="font-semibold">{data.production_detail.production_description}</p>
          {data.production_detail.formato && <p>Formato: {data.production_detail.formato}</p>}
          {data.production_detail.tapas_spec && <p>{data.production_detail.tapas_spec}</p>}
          {data.production_detail.interior_spec && <p>{data.production_detail.interior_spec}</p>}
          {data.production_detail.acabado && <p>Acabado: {data.production_detail.acabado}</p>}
        </CardContent>
      </Card>

      {/* Tapas */}
      {data.tapas.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Distribución de Tapas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {data.tapas.map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-700 rounded">
                  <Badge variant="outline" className="font-bold">{t.code}</Badge>
                  <span className="flex-1 truncate">{t.destination}</span>
                  <span className="font-bold">{t.quantity.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      {data.items[0] && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Item {data.items[0].item_number}: {data.items[0].description}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
              <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded text-center">
                <div className="text-muted-foreground">Ancho</div>
                <div className="font-bold">{data.items[0].sheet_width}</div>
              </div>
              <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded text-center">
                <div className="text-muted-foreground">Largo</div>
                <div className="font-bold">{data.items[0].sheet_height}</div>
              </div>
              <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded text-center">
                <div className="text-muted-foreground">Hojas s/c</div>
                <div className="font-bold">{data.items[0].hojas_sin_cortar.toLocaleString()}</div>
              </div>
              <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded text-center">
                <div className="text-muted-foreground">Pi/Base</div>
                <div className="font-bold">{data.items[0].pi_base.toLocaleString()}</div>
              </div>
              <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded text-center">
                <div className="text-muted-foreground">Pi/Sobr.</div>
                <div className="font-bold">{data.items[0].pi_sobrante}</div>
              </div>
              <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded text-center">
                <div className="text-muted-foreground">Pl. Máq.</div>
                <div className="font-bold">{data.items[0].pliegos_a_maquina.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pliegos */}
      {data.pliegos.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Detalle de Pliegos</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Pliego</TableHead>
                  <TableHead className="text-xs">Descripción</TableHead>
                  <TableHead className="text-xs text-right">Tiraje</TableHead>
                  <TableHead className="text-xs text-right">Sobr.</TableHead>
                  <TableHead className="text-xs text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pliegos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-bold">{p.pliego_number}</TableCell>
                    <TableCell>{p.description}</TableCell>
                    <TableCell className="text-right font-mono">{p.tiraje.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{p.sobrantes}</TableCell>
                    <TableCell className="text-right font-bold">
                      {p.cantidad.toLocaleString()}{p.nota ? ` ${p.nota}` : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Machine + Process */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Máquina</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 text-sm space-y-1">
            <p><strong>Tipo:</strong> {data.machine.machine_type.replace(/_/g, ' ').toUpperCase()}</p>
            <p><strong>Color:</strong> {data.machine.color_config}</p>
            <p><strong>Tiraje:</strong> {data.machine.tiraje.toLocaleString()}</p>
            {data.machine.ctp_needed && <p><strong>CTP:</strong> {data.machine.ctp_count || '✓'}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Resumen de Procesos</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="font-bold uppercase">{data.process_summary.description}</p>
          </CardContent>
        </Card>
      </div>

      {/* Admin */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs uppercase text-muted-foreground">Datos Administrativos</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div><span className="text-muted-foreground">Solicitante:</span> <strong>{data.admin.solicitante}</strong></div>
            <div><span className="text-muted-foreground">Vendedor:</span> <strong>{data.admin.vendedor}</strong></div>
            <div><span className="text-muted-foreground">RUT:</span> {data.admin.rut}</div>
            <div><span className="text-muted-foreground">Pago:</span> {data.admin.categoria_pago}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
