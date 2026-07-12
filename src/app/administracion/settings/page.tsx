'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, Bell, Shield, Database, Palette, Moon, Sun, ArrowRight, KeyRound, Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, COMMON_PASSWORD_COUNT } from '@/lib/password-policy';
import { CostOverrunAlerts } from '@/components/financial/CostOverrunAlerts';
import { useCostAlerts } from '@/hooks/use-cost-alerts';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ManageLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      Gestionar <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

export default function AdminSettingsPage() {
  const { setTheme, resolvedTheme } = useTheme();
  const { data: costAlerts } = useCostAlerts();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const supabaseHost = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').host; } catch { return '—'; }
  })();

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuración del Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">Parámetros generales de la aplicación</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Idioma y Región — Spanish native (decision 2026-07-05); regional info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4 text-muted-foreground" /> Idioma y Región
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Row label="Idioma del sistema"><Badge variant="secondary" className="text-xs">Español</Badge></Row>
              <Row label="Zona horaria"><Badge variant="secondary" className="text-xs">America/Santiago</Badge></Row>
              <Row label="Formato de moneda"><Badge variant="secondary" className="text-xs">CLP $</Badge></Row>
            </CardContent>
          </Card>

          {/* Apariencia — live theme toggle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4 text-muted-foreground" /> Apariencia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Row label="Tema">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                  {!mounted ? 'Tema' : resolvedTheme === 'dark' ? <><Moon className="h-3 w-3" /> Oscuro</> : <><Sun className="h-3 w-3" /> Claro</>}
                </Button>
              </Row>
              <Row label="Modo compacto en sidebar"><Badge variant="outline" className="text-xs text-muted-foreground">Desde la barra lateral</Badge></Row>
            </CardContent>
          </Card>

          {/* Notificaciones — managed in module */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-muted-foreground" /> Notificaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Row label="Alertas y avisos del sistema"><ManageLink href="/administracion/notifications" /></Row>
              <Row label="Notificaciones WhatsApp"><ManageLink href="/operaciones/whatsapp" /></Row>
              <Row label="Alerta de sobrecosto de OT">
                <Badge className={costAlerts && costAlerts.count > 0 ? 'bg-red-500/15 text-red-600 text-xs' : 'bg-green-500/15 text-green-600 text-xs'}>
                  {costAlerts ? (costAlerts.count > 0 ? `${costAlerts.count} sobre ${costAlerts.threshold}%` : 'sin alertas') : '—'}
                </Badge>
              </Row>
            </CardContent>
          </Card>

          {/* Seguridad y Diagnóstico */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-muted-foreground" /> Seguridad y Diagnóstico
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Row label="Usuarios y roles"><ManageLink href="/administracion/users" /></Row>
              <Row label="Log de auditoría y seguridad"><ManageLink href="/administracion/diagnostics" /></Row>
              <Row label="Política de contraseñas"><Badge variant="secondary" className="text-xs">NIST 800-63B</Badge></Row>
            </CardContent>
          </Card>

          {/* Política de contraseñas — real, enforced on user creation */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-muted-foreground" /> Política de contraseñas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Row label="Longitud mínima"><Badge variant="secondary" className="text-xs">{MIN_PASSWORD_LENGTH} caracteres</Badge></Row>
              <Row label="Longitud máxima"><Badge variant="secondary" className="text-xs">{MAX_PASSWORD_LENGTH} caracteres</Badge></Row>
              <Row label="Lista de bloqueo (contraseñas comunes / filtradas)">
                <Badge className="gap-1 bg-green-500/15 text-green-600 text-xs"><Check className="h-3 w-3" /> {COMMON_PASSWORD_COUNT} activas</Badge>
              </Row>
              <Row label="Complejidad obligatoria / rotación periódica">
                <Badge variant="outline" className="text-xs text-muted-foreground">Desactivadas (NIST 800-63B)</Badge>
              </Row>
              <p className="text-xs text-muted-foreground pt-2">
                Aplicada al crear o cambiar contraseñas de usuario. Alineada con NIST SP 800-63B: mínimo 8, sin complejidad forzada ni caducidad, con verificación contra contraseñas comprometidas.
              </p>
            </CardContent>
          </Card>

          {/* Base de Datos — real read-only info */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-muted-foreground" /> Base de Datos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Row label="Supabase (host activo)"><Badge variant="secondary" className="font-mono text-xs">{supabaseHost}</Badge></Row>
              <Row label="Diagnóstico de conexión"><ManageLink href="/administracion/diagnostics" /></Row>
            </CardContent>
          </Card>

          {/* Alerta de sobrecosto — configurable threshold + live over-budget OTs */}
          <CostOverrunAlerts />
        </div>

        <p className="text-xs text-muted-foreground">
          El tema se aplica al instante. El resto de los parámetros se gestiona en su módulo correspondiente.
        </p>
      </div>
    </ProtectedRoute>
  );
}
