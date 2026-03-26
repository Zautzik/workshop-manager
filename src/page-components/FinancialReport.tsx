'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/gonsa-logo.jpg" alt="Gonsa Logo" className="h-12 w-12 rounded-lg object-cover" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Financial Report</h1>
            <p className="text-muted-foreground">Comprehensive financial analysis and cost tracking</p>
          </div>
        </div>
        <Button onClick={handleBack} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ot-financials" className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="ot-financials">OT Financials</TabsTrigger>
          <TabsTrigger value="cost-analysis">Análisis de Costos</TabsTrigger>
          <TabsTrigger value="cost-center">Centro de Costos</TabsTrigger>
          <TabsTrigger value="machine-costs">Machine Cost Analysis</TabsTrigger>
          <TabsTrigger value="investments">Equipment Investments</TabsTrigger>
          <TabsTrigger value="payroll">Monthly Payroll</TabsTrigger>
          <TabsTrigger value="cost-timeline">Employee Cost Timeline</TabsTrigger>
          <TabsTrigger value="labor-margin">Order Labor Margin</TabsTrigger>
        </TabsList>

        <TabsContent value="ot-financials">
          <OTFinancialTracking />
        </TabsContent>

        <TabsContent value="cost-analysis">
          <OTCostAnalysisReport />
        </TabsContent>

        <TabsContent value="cost-center">
          <CostCenterManager />
        </TabsContent>

        <TabsContent value="machine-costs">
          <MachineCostAnalysis />
        </TabsContent>

        <TabsContent value="investments">
          <EquipmentInvestmentAnalysis />
        </TabsContent>

        <TabsContent value="payroll">
          <MonthlyPayrollCalculator />
        </TabsContent>

        <TabsContent value="cost-timeline">
          <EmployeeCostTimeline />
        </TabsContent>

        <TabsContent value="labor-margin">
          <OrderLaborMarginAnalysis />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialReport;
