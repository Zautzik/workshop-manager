'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
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
  Settings,
  LogOut,
  Moon,
  Sun,
  Globe,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Package,
  ShoppingCart,
  UserCog,
  Menu,
  MessageSquare,
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  roles?: string[];
  group: string;
}

const navItems: NavItem[] = [
  // Main
  { label: 'Inicio', icon: Home, href: '/admin', group: 'main', roles: ['admin', 'manager', 'supervisor', 'hr_manager', 'technician'] },

  // Operations
  { label: 'Flujo de Trabajo', icon: Factory, href: '/workflow', group: 'operations', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Producción', icon: ClipboardList, href: '/workflow/production', group: 'operations', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'WhatsApp Producción', icon: MessageSquare, href: '/workflow/whatsapp', group: 'operations', roles: ['admin', 'supervisor', 'manager'] },
  { label: 'Mis Reportes WA', icon: MessageSquare, href: '/workflow/whatsapp/operator', group: 'operations', roles: ['technician'] },

  // Management (KPIs, analytics, cost reports)
  { label: 'Resumen Ejecutivo', icon: LayoutDashboard, href: '/admin/overview', group: 'management', roles: ['admin', 'manager'] },
  { label: 'KPIs & Reportes', icon: BarChart3, href: '/manager', group: 'management', roles: ['admin', 'manager'] },
  { label: 'Finanzas', icon: DollarSign, href: '/financial', group: 'management', roles: ['admin', 'manager'] },

  // HR
  { label: 'Recursos Humanos', icon: Users, href: '/hr', group: 'hr', roles: ['admin', 'hr_manager'] },

  // Maintenance
  { label: 'Mantenimiento', icon: Wrench, href: '/maintenance', group: 'maintenance', roles: ['admin', 'technician', 'supervisor'] },

  // Admin
  { label: 'Usuarios', icon: UserCog, href: '/admin/users', group: 'admin', roles: ['admin'] },
  { label: 'Operarios', icon: Users, href: '/admin/workers', group: 'admin', roles: ['admin'] },
  { label: 'Inventario', icon: Package, href: '/admin/inventory', group: 'admin', roles: ['admin'] },
  { label: 'Compras', icon: ShoppingCart, href: '/admin/purchases', group: 'admin', roles: ['admin'] },
];

const groupLabels: Record<string, { en: string; es: string }> = {
  main: { en: 'Main', es: 'Principal' },
  operations: { en: 'Operations', es: 'Operaciones' },
  management: { en: 'Management', es: 'Gestión' },
  hr: { en: 'People', es: 'Personas' },
  maintenance: { en: 'Maintenance', es: 'Mantenimiento' },
  admin: { en: 'Administration', es: 'Administración' },
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
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Factory className="w-5 h-5 text-primary" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-semibold text-foreground truncate">GonsAdmin</h1>
            <p className="text-[10px] text-muted-foreground truncate capitalize">{role?.replace('_', ' ')}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-1 px-2">
          {groups.map((group, gi) => {
            const groupItems = filteredItems.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;

            return (
              <div key={group}>
                {gi > 0 && <Separator className="my-3 opacity-50" />}
                {!collapsed && (
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {language === 'es' ? groupLabels[group]?.es : groupLabels[group]?.en}
                  </p>
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
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                        "hover:bg-primary/8 hover:text-foreground",
                        active
                          ? "bg-primary/10 text-primary font-medium shadow-sm"
                          : "text-muted-foreground",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", active && "text-primary")} />
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
          <span className="text-sm font-medium text-foreground">GonsAdmin</span>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
