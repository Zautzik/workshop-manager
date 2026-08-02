import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';

export default function ComercialLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleBreadcrumbs />
      {children}
    </>
  );
}
