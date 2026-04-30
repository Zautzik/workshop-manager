'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ForgeHexLogo } from '@/components/branding/ForgeHexLogo';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Home,
  Factory,
  BarChart3,
  DollarSign,
  Users,
  Wrench,
  LogOut,
  Moon,
  Sun,
  Globe,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CalendarDays,
  LayoutDashboard,
  Package,
  ShoppingCart,
  UserCog,
  Menu,
  MessageSquare,
  Warehouse,
  Bell,
  Plug,
  BookOpen,
  Cpu,
  LayoutGrid,
  TrendingUp,
  Settings2,
} from 'lucide-react';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ReportingQuickActions } from '@/components/ReportingQuickActions';

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  roles?: string[];
  group: string;
}

// ─── 7 categories matching the Inicio dashboard cards ─────────────────────────
const navItems: NavItem[] = [
  // ① Inicio
  { label: 'Inicio', icon: Home, href: '/admin', group: 'main', roles: ['admin', 'manager', 'supervisor', 'hr_manager', 'technician'] },

  // ② Gestión de Taller — all workflow/production functions
  { label: 'Gestión de Taller',   icon: Factory,       href: '/workflow',                  group: 'gestion', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Planta',              icon: Factory,       href: '/workflow/planta',           group: 'gestion', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Planta Integrada',    icon: LayoutGrid,    href: '/workflow/planta-integrada', group: 'gestion', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Kanban',              icon: ClipboardList, href: '/workflow/kanban',           group: 'gestion', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Plan Semanal',        icon: CalendarDays,  href: '/workflow/plan-semanal',     group: 'gestion', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'WhatsApp Producción', icon: MessageSquare, href: '/workflow/whatsapp',         group: 'gestion', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Bodega',              icon: Warehouse,     href: '/workflow/warehouse',        group: 'gestion', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Seguimiento OTs',     icon: TrendingUp,    href: '/workflow/production',       group: 'gestion', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Mis Reportes',        icon: MessageSquare, href: '/workflow/whatsapp/operator',group: 'gestion', roles: ['technician'] },

  // ④ KPIs & Reportes — analytics & executive summaries
  { label: 'Resumen Ejecutivo', icon: LayoutDashboard, href: '/admin/overview', group: 'kpis', roles: ['admin', 'manager'] },
  { label: 'KPIs & Reportes',   icon: BarChart3,       href: '/manager',        group: 'kpis', roles: ['admin', 'manager'] },
  { label: 'Notificaciones',    icon: Bell,            href: '/admin/notifications', group: 'kpis', roles: ['admin', 'manager', 'supervisor', 'hr_manager', 'technician'] },

  // ⑤ Finanzas
  { label: 'Finanzas', icon: DollarSign, href: '/financial', group: 'financial', roles: ['admin', 'manager'] },

  // ⑥ Recursos Humanos
  { label: 'Recursos Humanos', icon: Users, href: '/hr', group: 'hr', roles: ['admin', 'hr_manager'] },

  // ⑦ Máquinas
  { label: 'Máquinas', icon: Cpu, href: '/maintenance', group: 'machines', roles: ['admin', 'technician', 'supervisor', 'manager'] },

  // ⑧ Inventario (maps to home card)
  { label: 'Inventario', icon: Package,      href: '/admin/inventory',  group: 'inventory', roles: ['admin', 'manager', 'supervisor'] },
  { label: 'Compras',    icon: ShoppingCart, href: '/admin/purchases',  group: 'inventory', roles: ['admin', 'manager'] },

  // ⑨ Administración (back-office, admin-only)
  { label: 'Usuarios',       icon: UserCog,  href: '/admin/users',        group: 'admin', roles: ['admin'] },
  { label: 'Operarios',      icon: Users,    href: '/admin/workers',       group: 'admin', roles: ['admin'] },
  { label: 'Integraciones',  icon: Plug,     href: '/admin/integrations',  group: 'admin', roles: ['admin', 'manager', 'supervisor'] },
  { label: 'Knowledge Base', icon: BookOpen, href: '/admin/training',      group: 'admin', roles: ['admin', 'manager', 'hr_manager'] },
  { label: 'Configuración',  icon: Settings2,href: '/admin/settings',      group: 'admin', roles: ['admin'] },
];

// Palette: label + accent colour (Tailwind utility classes) per group
const groupMeta: Record<string, { es: string; en: string; dot: string; active: string; text: string }> = {
  main:       { es: 'Inicio',              en: 'Home',             dot: 'bg-slate-400',   active: 'bg-slate-500/10 text-slate-300',    text: 'text-slate-400' },
  gestion:    { es: 'Gestión de Taller',   en: 'Workshop Mgmt',    dot: 'bg-sky-400',     active: 'bg-sky-500/15 text-sky-300',        text: 'text-sky-400' },
  kpis:       { es: 'KPIs & Reportes',     en: 'KPIs & Reports',   dot: 'bg-violet-400',  active: 'bg-violet-500/15 text-violet-300',  text: 'text-violet-400' },
  financial:  { es: 'Finanzas',            en: 'Finance',          dot: 'bg-green-400',   active: 'bg-green-500/15 text-green-300',    text: 'text-green-400' },
  hr:         { es: 'Recursos Humanos',    en: 'Human Resources',  dot: 'bg-amber-400',   active: 'bg-amber-500/15 text-amber-300',    text: 'text-amber-400' },
  machines:   { es: 'Máquinas',            en: 'Machines',         dot: 'bg-orange-400',  active: 'bg-orange-500/15 text-orange-300',  text: 'text-orange-400' },
  inventory:  { es: 'Inventario',          en: 'Inventory',        dot: 'bg-cyan-400',    active: 'bg-cyan-500/15 text-cyan-300',      text: 'text-cyan-400' },
  admin:      { es: 'Administración',      en: 'Administration',   dot: 'bg-rose-400',    active: 'bg-rose-500/15 text-rose-300',      text: 'text-rose-400' },
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signOut } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Public routes — no shell needed
  const isPublicRoute = pathname === '/' || pathname === '/login';

  // While auth is loading, render children (Login/root) or show a spinner
  if (loading) {
    if (isPublicRoute) return <>{children}</>;
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — show login page or redirect
  if (!user) {
    if (isPublicRoute) return <>{children}</>;
    // Redirect to login for protected routes
    router.push('/login');
    return null;
  }

  // Authenticated user on login page — skip shell, Login component handles redirect
  if (isPublicRoute) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  const filteredItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(role || '')
  );

  const groups = [...new Set(filteredItems.map((item) => item.group))];

  const isActive = (href: string) => {
    // Exact match for home
    if (href === '/admin') return pathname === '/admin';
    // For everything else, match exact or sub-paths
    return pathname === href || pathname.startsWith(href + '/');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-5 border-b border-border/50",
        collapsed && "justify-center px-2"
      )}>
        <ForgeHexLogo
          size={32}
          showWordmark={!collapsed}
          subtitle={role?.replace('_', ' ')}
          className={collapsed ? 'justify-center' : undefined}
        />
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-0.5 px-2">
          {groups.map((group, gi) => {
            const groupItems = filteredItems.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            const meta = groupMeta[group] ?? { es: group, en: group, dot: 'bg-slate-400', active: 'bg-slate-500/10 text-slate-300', text: 'text-slate-400' };

            return (
              <div key={group}>
                {gi > 0 && <Separator className="my-2.5 opacity-30" />}
                {!collapsed && (
                  <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.dot)} />
                    <p className={cn("text-[10px] font-semibold uppercase tracking-widest", meta.text)}>
                      {language === 'es' ? meta.es : meta.en}
                    </p>
                  </div>
                )}
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  const button = (
                    <button
                      key={item.href}
                      onClick={() => {
                        router.push(item.href);
                        setMobileOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-150",
                        active
                          ? cn(meta.active, "font-medium shadow-sm")
                          : "text-muted-foreground/80 hover:text-foreground hover:bg-white/5",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", active ? meta.text : "opacity-70")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href} delayDuration={0}>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <React.Fragment key={item.href}>{button}</React.Fragment>;
                })}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Bottom actions */}
      <div className={cn("border-t border-border/50 p-3 space-y-1", collapsed && "px-2")}>
        {/* Theme toggle */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors",
                collapsed && "justify-center px-2"
              )}
            >
              {theme === 'light' ? <Moon className="w-4 h-4 shrink-0" /> : <Sun className="w-4 h-4 shrink-0" />}
              {!collapsed && <span>{theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</span>}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">{theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</TooltipContent>
          )}
        </Tooltip>

        {/* Language toggle */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors",
                collapsed && "justify-center px-2"
              )}
            >
              <Globe className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{language === 'en' ? 'Español' : 'English'}</span>}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">{language === 'en' ? 'Español' : 'English'}</TooltipContent>
          )}
        </Tooltip>

        <Separator className="my-1 opacity-50" />

        {/* User info + Logout */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors",
                collapsed && "justify-center px-2"
              )}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && (
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="truncate text-xs">{user?.email}</span>
                  <span className="text-[10px] text-muted-foreground/60">Cerrar sesión</span>
                </div>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">Cerrar sesión</TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border/50 transform transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-200",
          collapsed ? "w-[56px]" : "w-60"
        )}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-5 -right-3 z-10 w-6 h-6 rounded-full border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/80 backdrop-blur-sm">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <ForgeHexLogo size={28} className="min-w-0" titleClassName="text-sm font-medium" />
          <div className="ml-auto flex items-center gap-1">
            <ReportingQuickActions isAdmin={role === 'admin'} />
            <NotificationCenter />
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between px-5 py-3 border-b border-border/50 bg-card/60 backdrop-blur-sm">
          <div className="text-sm text-muted-foreground">
            <ForgeHexLogo
              size={28}
              titleClassName="text-sm font-semibold"
              subtitleClassName="text-xs"
              subtitle={role?.replace('_', ' ')}
            />
          </div>
          <div className="flex items-center gap-2">
            <ReportingQuickActions isAdmin={role === 'admin'} />
            <NotificationCenter />
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
