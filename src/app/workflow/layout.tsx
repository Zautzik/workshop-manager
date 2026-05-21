import BackToModule from '@/components/BackToModule';

export default function WorkflowLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackToModule modulePath="/workflow" moduleName="Operaciones" />
      {children}
    </>
  );
}
