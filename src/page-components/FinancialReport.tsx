'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from '@/lib/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { OTFinancialTracking } from '@/components/financial/OTFinancialTracking';
import { MachineCostAnalysis } from '@/components/financial/MachineCostAnalysis';
import { EquipmentInvestmentAnalysis } from '@/components/financial/EquipmentInvestmentAnalysis';

const FinancialReport = () => {
  const navigate = useNavigate();
  const { role } = useAuth();

  const handleBack = () => {
    const dashboardRoutes = {
      manager: '/manager',
      admin: '/admin',
      supervisor: '/supervisor'
    };
    navigate(dashboardRoutes[role || 'manager']);
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ot-financials">OT Financials</TabsTrigger>
          <TabsTrigger value="machine-costs">Machine Cost Analysis</TabsTrigger>
          <TabsTrigger value="investments">Equipment Investments</TabsTrigger>
        </TabsList>

        <TabsContent value="ot-financials">
          <OTFinancialTracking />
        </TabsContent>

        <TabsContent value="machine-costs">
          <MachineCostAnalysis />
        </TabsContent>

        <TabsContent value="investments">
          <EquipmentInvestmentAnalysis />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialReport;
