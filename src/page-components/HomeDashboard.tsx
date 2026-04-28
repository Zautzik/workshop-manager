'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Factory,
  BarChart3,
  DollarSign,
  Users,
  Wrench,
  ClipboardList,
  Package,
  ArrowRight,
} from 'lucide-react';

interface QuickAction {
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  color: string;
  roles: string[];
}

const quickActions: QuickAction[] = [
  {
    label: 'Flujo de Trabajo',
    description: 'Gestionar asignaciones, turnos y órdenes de trabajo',
    icon: Factory,
    href: '/workflow',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/15',
    roles: ['admin', 'supervisor', 'manager'],
  },
  {
    label: 'Producción',
    description: 'Órdenes de trabajo y seguimiento de producción',
    icon: ClipboardList,
    href: '/workflow/production',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/15',
    roles: ['admin', 'supervisor', 'manager'],
  },
  {
    label: 'KPIs & Reportes',
    description: 'Analítica, rendimiento y reportes gerenciales',
    icon: BarChart3,
    href: '/manager',
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/15',
    roles: ['admin', 'manager'],
  },
  {
    label: 'Finanzas',
    description: 'Control de costos, nómina y análisis financiero',
    icon: DollarSign,
    href: '/financial',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:border-green-500/40 hover:bg-green-500/15',
    roles: ['admin', 'manager'],
  },
  {
    label: 'Recursos Humanos',
    description: 'Empleados, contratos, licencias y certificaciones',
    icon: Users,
    href: '/hr',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/15',
    roles: ['admin', 'hr_manager'],
  },
  {
    label: 'Máquinas',
    description: 'Registro de máquinas, mantenimiento y órdenes de trabajo',
    icon: Wrench,
    href: '/maintenance',
    color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:border-orange-500/40 hover:bg-orange-500/15',
    roles: ['admin', 'technician', 'supervisor'],
  },
  {
    label: 'Inventario',
    description: 'Materiales, suministros y control de stock',
    icon: Package,
    href: '/admin/inventory',
    color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 hover:border-cyan-500/40 hover:bg-cyan-500/15',
    roles: ['admin'],
  },
];

export default function HomeDashboard() {
  const { user, role } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();

  const visibleActions = quickActions.filter(
    (action) => action.roles.includes(role || '')
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return language === 'es' ? 'Buenos días' : 'Good morning';
    if (hour < 18) return language === 'es' ? 'Buenas tardes' : 'Good afternoon';
    return language === 'es' ? 'Buenas noches' : 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero section */}
      <div className="px-6 pt-12 pb-8 md:px-12 md:pt-16 md:pb-10">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            {getGreeting()}, <span className="text-foreground capitalize">{firstName}</span>
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
            {language === 'es' ? '¿Cómo puedo ayudarte hoy?' : 'How can I help you today?'}
          </h1>
          <p className="mt-3 text-base text-muted-foreground max-w-xl">
            {language === 'es'
              ? 'Selecciona un módulo para comenzar o navega usando el menú lateral.'
              : 'Select a module to get started or navigate using the side menu.'}
          </p>
        </div>
      </div>

      {/* Quick actions grid */}
      <div className="flex-1 px-6 pb-12 md:px-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.href}
                onClick={() => router.push(action.href)}
                className={`group relative flex flex-col items-start gap-4 p-5 rounded-xl border transition-all duration-200 text-left ${action.color}`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="p-2.5 rounded-lg bg-white/50 dark:bg-white/5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] text-foreground">{action.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{action.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
