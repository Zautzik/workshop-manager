import BackToModule from '@/components/BackToModule';

export default function FinancialLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/financial" moduleName="Analítica" />
      {children}
    </>
  );
}
