'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Printer, Calculator, Factory, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/* ================================================================ */
/*  OT Creation Choice — Pick between Cotización or Producción      */
/* ================================================================ */

interface OTCreationChoiceProps {
  onSelectQuote: () => void;
  onSelectProduction: () => void;
  onCancel: () => void;
}

export function OTCreationChoice({
  onSelectQuote,
  onSelectProduction,
  onCancel,
}: OTCreationChoiceProps) {
  const { i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {isSpanish ? 'Volver' : 'Back'}
          </Button>
          <h1 className="text-xl font-bold text-foreground">
            {isSpanish ? '¿Qué tipo de OT deseas crear?' : 'What type of OT do you want to create?'}
          </h1>
        </div>
      </div>

      {/* Choice Cards */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cotización / Quote Wizard */}
          <Card
            className="relative border-2 border-border hover:border-primary/60 transition-all cursor-pointer group bg-card/80"
            onClick={onSelectQuote}
          >
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <Calculator className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">
                  {isSpanish ? 'Cotización / Presupuesto' : 'Quote / Budget'}
                </h2>
                <Badge variant="outline" className="text-xs mb-3">
                  {isSpanish ? '5 pasos' : '5 steps'}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {isSpanish
                    ? 'Wizard completo para cotizar trabajos. Incluye especificaciones técnicas, cálculos automáticos de imposición, operaciones y precios.'
                    : 'Full wizard to quote jobs. Includes technical specifications, automatic imposition calculations, operations and pricing.'}
                </p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 text-left w-full mt-2">
                <li className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                  {isSpanish ? 'Información del cliente y producto' : 'Client & product info'}
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                  {isSpanish ? 'Especificaciones técnicas (sustrato, colores, acabados)' : 'Technical specs (substrate, colors, finishes)'}
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                  {isSpanish ? 'Cálculos de imposición y materiales' : 'Imposition & materials calculations'}
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                  {isSpanish ? 'Operaciones y costos unitarios' : 'Operations & unit costs'}
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                  {isSpanish ? 'Precio final con margen y comisión' : 'Final price with margin & commission'}
                </li>
              </ul>
              <Button variant="outline" className="mt-4 gap-2 group-hover:bg-blue-500 group-hover:text-white group-hover:border-blue-500 transition-colors">
                {isSpanish ? 'Crear Cotización' : 'Create Quote'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Producción / Physical OT Form */}
          <Card
            className="relative border-2 border-border hover:border-primary/60 transition-all cursor-pointer group bg-card/80"
            onClick={onSelectProduction}
          >
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                <Printer className="w-8 h-8 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">
                  {isSpanish ? 'Orden de Producción' : 'Production Order'}
                </h2>
                <Badge variant="outline" className="text-xs mb-3">
                  {isSpanish ? '10 secciones' : '10 sections'}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {isSpanish
                    ? 'Formulario completo de producción basado en la OT física del taller. Selecciona categoría (Etiqueta, Libro, Caja, etc.) con valores pre-cargados.'
                    : 'Complete production form based on the physical workshop OT. Select category (Label, Book, Box, etc.) with pre-loaded values.'}
                </p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 text-left w-full mt-2">
                <li className="flex items-center gap-2">
                  <Factory className="w-3 h-3 text-amber-400 shrink-0" />
                  {isSpanish ? '14 categorías con defaults por tipo' : '14 categories with type-specific defaults'}
                </li>
                <li className="flex items-center gap-2">
                  <Factory className="w-3 h-3 text-amber-400 shrink-0" />
                  {isSpanish ? 'Tapas, pliegos, montaje, máquinas' : 'Covers, sheets, assembly, machines'}
                </li>
                <li className="flex items-center gap-2">
                  <Factory className="w-3 h-3 text-amber-400 shrink-0" />
                  {isSpanish ? 'Configuración de máquina y terminaciones' : 'Machine config & finishing'}
                </li>
                <li className="flex items-center gap-2">
                  <Factory className="w-3 h-3 text-amber-400 shrink-0" />
                  {isSpanish ? 'Desglose de costos en tiempo real' : 'Real-time cost breakdown'}
                </li>
                <li className="flex items-center gap-2">
                  <Factory className="w-3 h-3 text-amber-400 shrink-0" />
                  {isSpanish ? 'Generación de PDF listo para imprimir' : 'Print-ready PDF generation'}
                </li>
              </ul>
              <Button variant="outline" className="mt-4 gap-2 group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-500 transition-colors">
                {isSpanish ? 'Crear Orden de Producción' : 'Create Production Order'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
