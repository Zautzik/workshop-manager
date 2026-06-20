import BackToModule from '@/components/BackToModule';
import { AnalyticsFiltersProvider } from '@/contexts/AnalyticsFiltersContext';

export default function AnaliticaLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnalyticsFiltersProvider>
      <BackToModule modulePath="/analitica" moduleName="Analítica" />
      {children}
    </AnalyticsFiltersProvider>
  );
}
