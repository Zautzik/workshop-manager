import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleBreadcrumbs />
      {children}
    </>
  );
}
