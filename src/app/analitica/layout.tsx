import { AnalyticsFiltersProvider } from '@/contexts/AnalyticsFiltersContext';

export default function AnaliticaLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnalyticsFiltersProvider>
      {children}
    </AnalyticsFiltersProvider>
  );
}
