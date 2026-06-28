'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import PurchasesManagement from '@/components/admin/PurchasesManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ShoppingCart, Truck } from 'lucide-react';

const VALID_TABS = ['compras', 'proveedores'] as const;
type TabKey = (typeof VALID_TABS)[number];

function ComprasTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const active: TabKey = (VALID_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as TabKey)
    : 'compras';

  const onChange = (value: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('tab', value);
    router.replace(`/operaciones/compras?${sp.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={active} onValueChange={onChange} className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="compras" className="gap-2">
          <ShoppingCart className="h-4 w-4" /> Compras
        </TabsTrigger>
        <TabsTrigger value="proveedores" className="gap-2">
          <Truck className="h-4 w-4" /> Proveedores
        </TabsTrigger>
      </TabsList>

      <TabsContent value="compras" className="mt-6">
        <PurchasesManagement />
      </TabsContent>
      <TabsContent value="proveedores" className="mt-6">
        <div className="rounded-xl border border-border/60 bg-card/60 p-8 text-center">
          <Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Directorio de proveedores</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Directorio y condiciones comerciales de proveedores — en desarrollo.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}

export default function PurchasesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">Órdenes de compra y proveedores</p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <ComprasTabs />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}
