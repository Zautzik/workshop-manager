import BackToModule from '@/components/BackToModule';

export default function OperacionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/operaciones" moduleName="Operaciones" />
      {children}
    </>
  );
}
