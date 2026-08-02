import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';
import { AnalyticsFiltersProvider } from '@/contexts/AnalyticsFiltersContext';

export default function AnaliticaLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnalyticsFiltersProvider>
      <ModuleBreadcrumbs />
      {children}
    </AnalyticsFiltersProvider>
  );
}
