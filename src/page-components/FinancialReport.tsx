'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, BarChart3, Wrench, Users, FileText } from 'lucide-react';
import { OTFinancialTracking } from '@/components/financial/OTFinancialTracking';
import { MachineCostAnalysis } from '@/components/financial/MachineCostAnalysis';
import { EquipmentInvestmentAnalysis } from '@/components/financial/EquipmentInvestmentAnalysis';
import { MonthlyPayrollCalculator } from '@/components/financial/MonthlyPayrollCalculator';
import { EmployeeCostTimeline } from '@/components/financial/EmployeeCostTimeline';
import { OrderLaborMarginAnalysis } from '@/components/financial/OrderLaborMarginAnalysis';
import { CostCenterManager } from '@/components/financial/CostCenterManager';
import { OTCostAnalysisReport } from '@/components/financial/OTCostAnalysisReport';

const FinancialReport = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
        <p className="text-sm text-muted-foreground mt-1">Análisis financiero y control de costos</p>
      </div>

      <Tabs defaultValue="analisis-costos" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-card/80 border border-border p-1 rounded-lg">
          <TabsTrigger value="analisis-costos" className="text-xs gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Análisis de Costos
          </TabsTrigger>
          <TabsTrigger value="seguimiento-ot" className="text-xs gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Seguimiento OT
          </TabsTrigger>
          <TabsTrigger value="centro-costos" className="text-xs gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            Centro de Costos
          </TabsTrigger>
          <TabsTrigger value="margen-laboral" className="text-xs gap-1.5">
            Margen por OT
          </TabsTrigger>
          <TabsTrigger value="costos-maquina" className="text-xs gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Costos Máquina
          </TabsTrigger>
          <TabsTrigger value="inversiones" className="text-xs gap-1.5">
            Inversiones
          </TabsTrigger>
          <TabsTrigger value="nomina" className="text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Nómina Mensual
          </TabsTrigger>
          <TabsTrigger value="costo-empleado" className="text-xs gap-1.5">
            Costo Empleado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analisis-costos">
          <OTCostAnalysisReport />
        </TabsContent>
        <TabsContent value="seguimiento-ot">
          <OTFinancialTracking />
        </TabsContent>
        <TabsContent value="centro-costos">
          <CostCenterManager />
        </TabsContent>
        <TabsContent value="margen-laboral">
          <OrderLaborMarginAnalysis />
        </TabsContent>
        <TabsContent value="costos-maquina">
          <MachineCostAnalysis />
        </TabsContent>
        <TabsContent value="inversiones">
          <EquipmentInvestmentAnalysis />
        </TabsContent>
        <TabsContent value="nomina">
          <MonthlyPayrollCalculator />
        </TabsContent>
        <TabsContent value="costo-empleado">
          <EmployeeCostTimeline />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialReport;
