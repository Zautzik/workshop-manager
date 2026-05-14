/**
 * @fileoverview Route Protection Component
 *
 * Wraps page content and checks the user's role before rendering.
 * If the user is not authenticated, shows nothing (AppShell handles redirect).
 * If the user's role is not in the allowed list, shows an access-denied message.
 */
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import type { AppRole } from '@/types/app-role';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Roles that can access this route. Omit to allow all authenticated users. */
  allowedRoles?: AppRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // AppShell handles unauthenticated state
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <div className="p-6 md:p-8">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Acceso Restringido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tu rol actual (<span className="font-medium capitalize">{role?.replace('_', ' ')}</span>) no tiene permiso para acceder a esta sección.
            </p>
            <Button variant="outline" onClick={() => router.push('/home')}>
              Volver al Inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
