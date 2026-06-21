import BackToModule from '@/components/BackToModule';

export default function ComercialLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/comercial" moduleName="Comercial" />
      {children}
    </>
  );
}
