import BackToModule from '@/components/BackToModule';

export default function AnaliticaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/analitica" moduleName="Analítica" />
      {children}
    </>
  );
}
