import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';
import { RealtimeProductionProvider } from '@/contexts/RealtimeProductionContext';

export default function OperacionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProductionProvider>
      <ModuleBreadcrumbs />
      {children}
    </RealtimeProductionProvider>
  );
}
