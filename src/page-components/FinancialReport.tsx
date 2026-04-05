'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, DollarSign, BarChart3, Wrench, Users, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { OTFinancialTracking } from '@/components/financial/OTFinancialTracking';
import { MachineCostAnalysis } from '@/components/financial/MachineCostAnalysis';
import { EquipmentInvestmentAnalysis } from '@/components/financial/EquipmentInvestmentAnalysis';
import { MonthlyPayrollCalculator } from '@/components/financial/MonthlyPayrollCalculator';
import { EmployeeCostTimeline } from '@/components/financial/EmployeeCostTimeline';
import { OrderLaborMarginAnalysis } from '@/components/financial/OrderLaborMarginAnalysis';
import { CostCenterManager } from '@/components/financial/CostCenterManager';
import { OTCostAnalysisReport } from '@/components/financial/OTCostAnalysisReport';

const FinancialReport = () => {
  const router = useRouter();
  const { role } = useAuth();

  const handleBack = () => {
    const dashboardRoutes: Record<string, string> = {
      manager: '/manager',
      admin: '/admin',
      supervisor: '/supervisor',
      technician: '/supervisor'
    };
    router.push(dashboardRoutes[role || 'manager']);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button onClick={handleBack} variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
            <p className="text-sm text-muted-foreground">Análisis financiero y control de costos</p>
          </div>
        </div>
      </div>

      {/* Tabs — grouped into logical sections */}
      <Tabs defaultValue="analisis-costos" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-card/80 border border-border p-1 rounded-lg">
          {/* OT-related */}
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
          {/* Equipment */}
          <TabsTrigger value="costos-maquina" className="text-xs gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Costos Máquina
          </TabsTrigger>
          <TabsTrigger value="inversiones" className="text-xs gap-1.5">
            Inversiones
          </TabsTrigger>
          {/* Payroll */}
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
