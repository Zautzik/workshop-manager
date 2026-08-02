import BackToModule from '@/components/BackToModule';

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/equipos" moduleName="Equipos" />
      {children}
    </>
  );
}
