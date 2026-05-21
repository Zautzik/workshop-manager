import BackToModule from '@/components/BackToModule';

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/maintenance" moduleName="Equipos" />
      {children}
    </>
  );
}
