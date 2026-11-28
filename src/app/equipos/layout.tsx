import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';
import { RealtimeProductionProvider } from '@/contexts/RealtimeProductionContext';

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    // El mismo channel que /operaciones: Carga y Economía dependen de las OT,
    // la agenda y el costo, que cambian mientras la pantalla está abierta.
    <RealtimeProductionProvider>
      <ModuleBreadcrumbs />
      {children}
    </RealtimeProductionProvider>
  );
}
