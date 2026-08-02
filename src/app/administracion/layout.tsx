import { ModuleBreadcrumbs } from '@/components/Breadcrumbs';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleBreadcrumbs />
      {children}
    </>
  );
}
