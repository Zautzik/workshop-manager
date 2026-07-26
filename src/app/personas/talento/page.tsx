'use client';

/**
 * Centro de Desarrollo de Talento — how each person grows.
 *
 * Deliberately its own workspace, not a section of the operational console:
 * different audience, different cadence, different intent. A supervisor opens
 * the console every morning; this one gets opened when someone is being trained,
 * certified or rewarded. Four scattered pages, one place.
 */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Network, GraduationCap, Award, Gift } from 'lucide-react';
import { CertificacionesContent } from '@/app/personas/certificaciones/page';
import { IncentivosContent } from '@/app/personas/incentivos/page';

// Both are heavy trees; keep them out of the initial bundle.
const CraftSkillTree = dynamic(() => import('@/components/hr/CraftSkillTree'));
const TrainingKnowledgeBase = dynamic(() => import('@/components/admin/TrainingKnowledgeBase'));

const loading = (
  <div className="space-y-4 pt-4">
    <Skeleton className="h-10 w-48" />
    <Skeleton className="h-[600px] w-full" />
  </div>
);

export default function DesarrolloTalentoPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Desarrollo de Talento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cómo crece cada persona: competencias, formación, acreditaciones y reconocimiento
          </p>
        </div>

        <Tabs defaultValue="habilidades" className="w-full">
          <TabsList>
            <TabsTrigger value="habilidades" className="gap-1.5">
              <Network className="h-4 w-4" /> Habilidades
            </TabsTrigger>
            <TabsTrigger value="capacitacion" className="gap-1.5">
              <GraduationCap className="h-4 w-4" /> Capacitación
            </TabsTrigger>
            <TabsTrigger value="certificaciones" className="gap-1.5">
              <Award className="h-4 w-4" /> Certificaciones
            </TabsTrigger>
            <TabsTrigger value="incentivos" className="gap-1.5">
              <Gift className="h-4 w-4" /> Incentivos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="habilidades" className="mt-4">
            <Suspense fallback={loading}>
              <CraftSkillTree />
            </Suspense>
          </TabsContent>

          <TabsContent value="capacitacion" className="mt-4">
            <Suspense fallback={loading}>
              <TrainingKnowledgeBase />
            </Suspense>
          </TabsContent>

          <TabsContent value="certificaciones" className="mt-4">
            <Suspense fallback={loading}>
              <CertificacionesContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="incentivos" className="mt-4">
            <Suspense fallback={loading}>
              <IncentivosContent />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
