'use client';
import { Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const CraftSkillTree = dynamic(() => import('@/components/hr/CraftSkillTree'));
const HorasReales = dynamic(
  () => import('@/components/hr/HorasReales').then((m) => m.HorasReales),
);

export default function HRHabilidadesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-[600px] w-full" /></div>}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Árbol de Habilidades</h1>
            <p className="text-sm text-muted-foreground mt-1">Habilidades, nivel de maestría y progreso por trabajador</p>
          </div>
          {/* Lo que el taller ya sabe va antes de lo que hay que declarar a mano. */}
          <HorasReales />
          <CraftSkillTree />
        </div>
      </Suspense>
    </ProtectedRoute>
  );
}
