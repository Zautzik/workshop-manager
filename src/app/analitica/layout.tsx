import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';
import { AnalyticsFiltersProvider } from '@/contexts/AnalyticsFiltersContext';
import { RealtimeProductionProvider } from '@/contexts/RealtimeProductionContext';

export default function AnaliticaLayout({ children }: { children: React.ReactNode }) {
  return (
    // El mismo channel que /operaciones: una pasada cerrada en el taller cambia
    // el costo real, y Rentabilidad tiene que enterarse sin recargar.
    <RealtimeProductionProvider>
      <AnalyticsFiltersProvider>
        <ModuleBreadcrumbs />
        {children}
      </AnalyticsFiltersProvider>
    </RealtimeProductionProvider>
  );
}
