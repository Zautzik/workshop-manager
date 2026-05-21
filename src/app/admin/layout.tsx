import BackToModule from '@/components/BackToModule';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/admin" moduleName="Administración" />
      {children}
    </>
  );
}
