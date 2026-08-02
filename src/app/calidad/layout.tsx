import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';

export default function CalidadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleBreadcrumbs />
      {children}
    </>
  );
}
