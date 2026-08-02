import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';

export default function OperacionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleBreadcrumbs />
      {children}
    </>
  );
}
