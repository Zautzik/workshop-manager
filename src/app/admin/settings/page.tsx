'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Settings, Globe, Bell, Shield, Database, Palette } from 'lucide-react';

const CONFIG_SECTIONS = [
  {
    icon: Globe,
    title: 'Idioma y Región',
    items: ['Idioma del sistema (ES / EN)', 'Zona horaria', 'Formato de moneda'],
  },
  {
    icon: Bell,
    title: 'Notificaciones',
    items: ['Umbral de alerta de costos OT (%)', 'Alertas de mantenimiento vencido', 'Notificaciones WhatsApp'],
  },
  {
    icon: Shield,
    title: 'Seguridad',
    items: ['Política de contraseñas', 'Sesión por inactividad (min)', 'Log de auditoría habilitado'],
  },
  {
    icon: Database,
    title: 'Base de Datos',
    items: ['Supabase URL activa', 'Backup automático', 'Retención de logs (días)'],
  },
  {
    icon: Palette,
    title: 'Apariencia',
    items: ['Tema por defecto (claro/oscuro)', 'Color de acento', 'Modo compacto en sidebar'],
  },
];

export default function AdminSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuración del Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">Parámetros generales de la aplicación</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CONFIG_SECTIONS.map(section => {
            const Icon = section.icon;
            return (
              <Card key={section.title}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {section.items.map(item => (
                    <div key={item} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                      <span className="text-sm text-muted-foreground">{item}</span>
                      <Badge variant="outline" className="text-xs">Config</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          La edición granular de parámetros se habilita por módulo. Contactar al administrador del sistema para cambios en producción.
        </p>
      </div>
    </ProtectedRoute>
  );
}
