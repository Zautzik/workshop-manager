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
  Menu,
  ShieldCheck,
} from 'lucide-react';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ReportingQuickActions } from '@/components/ReportingQuickActions';

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  roles?: string[];
  dot: string;
  activeBg: string;
  activeIcon: string;
}

const navItems: NavItem[] = [
  { label: 'Inicio',         icon: Home,       href: '/home',        roles: ['admin', 'manager', 'supervisor', 'hr_manager', 'technician'], dot: 'bg-slate-400',   activeBg: 'bg-slate-200 dark:bg-slate-500/20',   activeIcon: 'text-slate-600 dark:text-slate-300'  },
  { label: 'Operaciones',    icon: Factory,    href: '/workflow',    roles: ['admin', 'supervisor', 'manager'],                             dot: 'bg-blue-500',    activeBg: 'bg-blue-100 dark:bg-blue-500/20',     activeIcon: 'text-blue-600 dark:text-blue-300'    },
  { label: 'Personas',       icon: Users,      href: '/hr',          roles: ['admin', 'hr_manager', 'supervisor'],                          dot: 'bg-amber-500',   activeBg: 'bg-amber-100 dark:bg-amber-500/20',   activeIcon: 'text-amber-600 dark:text-amber-300'  },
  { label: 'Máquinas',       icon: Wrench,     href: '/maintenance', roles: ['admin', 'technician', 'supervisor', 'manager'],               dot: 'bg-orange-500',  activeBg: 'bg-orange-100 dark:bg-orange-500/20', activeIcon: 'text-orange-600 dark:text-orange-300'},
  { label: 'Finanzas',       icon: DollarSign, href: '/financial',   roles: ['admin', 'manager'],                                          dot: 'bg-green-500',   activeBg: 'bg-green-100 dark:bg-green-500/20',   activeIcon: 'text-green-600 dark:text-green-300'  },
  { label: 'Reportes',       icon: BarChart3,  href: '/manager',     roles: ['admin', 'manager'],                                          dot: 'bg-indigo-500',  activeBg: 'bg-indigo-100 dark:bg-indigo-500/20', activeIcon: 'text-indigo-600 dark:text-indigo-300'},
  { label: 'Administración', icon: ShieldCheck,href: '/admin',       roles: ['admin'],                                                     dot: 'bg-violet-500',  activeBg: 'bg-violet-100 dark:bg-violet-500/20', activeIcon: 'text-violet-600 dark:text-violet-300'},
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signOut } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist sidebar collapsed preference
  useEffect(() => {
    const stored = localStorage.getItem('sidebar_collapsed');
    if (stored !== null) setCollapsed(stored === 'true');
  }, []);
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed));
  }, [collapsed]);

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

  const isActive = (href: string) => {
    // Exact match for home and admin landing (avoid matching all /admin/* as "home")
    if (href === '/home' || href === '/admin') return pathname === href;
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
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            const button = (
              <button
                key={item.href}
                onClick={() => { router.push(item.href); setMobileOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150",
                  active
                    ? cn(item.activeBg, item.activeIcon, "font-semibold")
                    : "text-foreground/40 hover:text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5",
                  collapsed && "justify-center px-0"
                )}
              >
                <span className="relative shrink-0">
                  <Icon className="w-5 h-5" />
                  <span className={cn("absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-card", item.dot)} />
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href} delayDuration={0}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return <React.Fragment key={item.href}>{button}</React.Fragment>;
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
          "hidden md:flex flex-col border-r border-border bg-card transition-all duration-200",
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
