import BackToModule from '@/components/BackToModule';

export default function HRLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/personas" moduleName="Personas" />
      {children}
    </>
  );
}
