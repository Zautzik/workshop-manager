import BackToModule from '@/components/BackToModule';

export default function CalidadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/calidad" moduleName="Calidad" />
      {children}
    </>
  );
}
