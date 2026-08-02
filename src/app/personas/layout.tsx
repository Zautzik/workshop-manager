import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';

export default function HRLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleBreadcrumbs />
      {children}
    </>
  );
}
