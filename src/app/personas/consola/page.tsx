'use client';

/**
 * Consola Operativa — everything about running the team today, in one place.
 *
 * These used to be four separate destinations (Empleados, Contratos,
 * Retribución, Asistencia) that all answered questions about the same person.
 * "Empleados" in particular added nothing the consolidated roster didn't
 * already show, so it is gone: the roster IS the employee directory, and
 * creating or editing a ficha happens right there.
 */

import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import PersonasModule from '@/page-components/PersonasModule';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, FileText, Wallet, UserCheck } from 'lucide-react';
import { ContratosContent } from '@/app/personas/contratos/page';
import { LicenciasContent } from '@/app/personas/licencias/page';
import { MonthlyPayrollCalculator } from '@/components/financial/MonthlyPayrollCalculator';

const loading = (
  <div className="space-y-4 pt-4">
    <Skeleton className="h-10 w-48" />
    <Skeleton className="h-96 w-full" />
  </div>
);

export default function ConsolaOperativaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Consola Operativa</h1>
          <p className="text-sm text-muted-foreground mt-1">
            El equipo hoy: quién es cada persona, cuánto cuesta, dónde está asignada y su situación laboral
          </p>
        </div>

        <Tabs defaultValue="equipo" className="w-full">
          <TabsList>
            <TabsTrigger value="equipo" className="gap-1.5">
              <Users className="h-4 w-4" /> Equipo
            </TabsTrigger>
            <TabsTrigger value="contratos" className="gap-1.5">
              <FileText className="h-4 w-4" /> Contratos
            </TabsTrigger>
            <TabsTrigger value="retribucion" className="gap-1.5">
              <Wallet className="h-4 w-4" /> Retribución
            </TabsTrigger>
            <TabsTrigger value="asistencia" className="gap-1.5">
              <UserCheck className="h-4 w-4" /> Asistencia
            </TabsTrigger>
          </TabsList>

          {/* The roster carries its own headings, so it renders bare here. */}
          <TabsContent value="equipo" className="mt-4">
            <PersonasModule embedded />
          </TabsContent>

          <TabsContent value="contratos" className="mt-4">
            <Suspense fallback={loading}>
              <ContratosContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="retribucion" className="mt-4">
            <Suspense fallback={loading}>
              <MonthlyPayrollCalculator />
            </Suspense>
          </TabsContent>

          <TabsContent value="asistencia" className="mt-4">
            <Suspense fallback={loading}>
              <LicenciasContent />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
