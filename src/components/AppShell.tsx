'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
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
  LogOut,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Menu,
  Search,
  ChevronDown,
} from 'lucide-react';
import { HOME_ITEM, MODULES } from '@/lib/navigation';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ReportingQuickActions } from '@/components/ReportingQuickActions';
import { GlobalSearch } from '@/components/GlobalSearch';
import Breadcrumbs from '@/components/Breadcrumbs';
import { useCostOverrunAlerts } from '@/hooks/use-cost-overrun-alerts';

interface SubItem {
  label: string;
  href: string;
}

interface SubGroup {
  group: string;
  items: SubItem[];
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  roles?: string[];
  dot: string;
  activeBg: string;
  activeIcon: string;
  children?: SubGroup[];
}

// Sidebar nav is derived from the single navigation source of truth so it can
// never drift from the module landing pages. Every module renders its groups as
// a submenu (previously only Operaciones had one).
const navItems: NavItem[] = [
  {
    label: HOME_ITEM.label, icon: HOME_ITEM.icon, href: HOME_ITEM.href, roles: HOME_ITEM.roles,
    dot: HOME_ITEM.dot, activeBg: HOME_ITEM.activeBg, activeIcon: HOME_ITEM.activeIcon,
  },
  ...MODULES.map<NavItem>((m) => ({
    label: m.label, icon: m.icon, href: m.href, roles: m.roles,
    dot: m.dot, activeBg: m.activeBg, activeIcon: m.activeIcon,
    children: m.groups.map<SubGroup>((g) => ({
      group: g.label,
      items: g.items.map<SubItem>((it) => ({ label: it.label, href: it.href })),
    })),
  })),
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [expandedNav, setExpandedNav] = useState<Record<string, boolean>>({});
  const toggleExpanded = (href: string) =>
    setExpandedNav(prev => ({ ...prev, [href]: !prev[href] }));

  useCostOverrunAlerts();

  // Public routes — no shell needed
  const isPublicRoute = pathname === '/' || pathname === '/login';
  const isFullscreenRoute = pathname === '/estacion' || pathname === '/operaciones/whatsapp/operator' || pathname.startsWith('/track/');

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

  // Auto-expand parent nav when navigating to a child route
  useEffect(() => {
    const parent = navItems.find(i => i.children && pathname.startsWith(i.href + '/'));
    if (parent) setExpandedNav(prev => ({ ...prev, [parent.href]: true }));
  }, [pathname]);

  // Kick unauthenticated visitors off protected routes. This runs in an effect
  // because navigating during render updates the Router while AppShell is still
  // rendering, which React reports as a setState-in-render error — it fires on
  // logout, when user drops to null while pathname is still the protected page.
  const needsAuthRedirect = !loading && !user && !isPublicRoute;
  useEffect(() => {
    if (needsAuthRedirect) router.replace('/login');
  }, [needsAuthRedirect, router]);

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

  // Not authenticated — show login page, or nothing while the effect above
  // redirects away from a protected route
  if (!user) {
    if (isPublicRoute) return <>{children}</>;
    return null;
  }

  // Authenticated user on login page — skip shell, Login component handles redirect
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Fullscreen pages bypass the AppShell nav entirely
  if (isFullscreenRoute) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  const filteredItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(role || '')
  );

  const isActive = (href: string) => {
    // Exact match for home and admin landing (avoid matching all /admin/* as "home")
    if (href === '/home' || href === '/administracion') return pathname === href;
    // For everything else, match exact or sub-paths
    return pathname === href || pathname.startsWith(href + '/');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      {/* h-16 is shared with the desktop header below so the two bottom borders
          line up across the sidebar/content seam. Change both together. */}
      <div className={cn(
        "flex h-16 shrink-0 items-center gap-3 px-4 border-b border-border/50",
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
        <nav className="space-y-0.5 px-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const hasChildren = !!item.children?.length;
            const isExpanded = expandedNav[item.href] ?? false;
            const childActive = hasChildren && item.children!.some(g => g.items.some(s => pathname === s.href || pathname.startsWith(s.href + '/')));

            const button = (
              <button
                key={item.href}
                onClick={() => {
                  if (hasChildren) {
                    toggleExpanded(item.href);
                    if (!isExpanded) { router.push(item.href); }
                  } else {
                    router.push(item.href);
                    setMobileOpen(false);
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150",
                  active || childActive
                    ? cn(item.activeBg, item.activeIcon, "font-semibold")
                    : "text-foreground/40 hover:text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5",
                  collapsed && "justify-center px-0"
                )}
              >
                <span className="relative shrink-0">
                  <Icon className="w-5 h-5" />
                  <span className={cn("absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-card", item.dot)} />
                </span>
                {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                {!collapsed && hasChildren && (
                  <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform duration-200 opacity-60", isExpanded && "rotate-180")} />
                )}
              </button>
            );

            const subMenu = hasChildren && isExpanded && !collapsed ? (
              <div className="ml-3 pl-3 border-l border-border/40 space-y-3 py-1 mb-1">
                {item.children!.map((group) => (
                  <div key={group.group}>
                    <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                      {group.group}
                    </p>
                    {group.items.map((sub) => {
                      const subActive = pathname === sub.href || pathname.startsWith(sub.href + '/');
                      return (
                        <button
                          key={sub.href}
                          onClick={() => { router.push(sub.href); setMobileOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                            subActive
                              ? cn(item.activeBg, item.activeIcon, "font-medium")
                              : "text-foreground/40 hover:text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5"
                          )}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", subActive ? item.dot : "bg-foreground/20")} />
                          <span className="truncate">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null;

            if (collapsed) {
              return (
                <Tooltip key={item.href} delayDuration={0}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return (
              <React.Fragment key={item.href}>
                {button}
                {subMenu}
              </React.Fragment>
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
              {!mounted ? <Sun className="w-4 h-4 shrink-0" /> : theme === 'light' ? <Moon className="w-4 h-4 shrink-0" /> : <Sun className="w-4 h-4 shrink-0" />}
              {!collapsed && <span>{!mounted ? '' : theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</span>}
            </button>
          </TooltipTrigger>
          {collapsed && mounted && (
            <TooltipContent side="right">{theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</TooltipContent>
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
          // `relative` anchors the collapse handle below to this sidebar. Without
          // it the handle's `-right-3` resolves against the viewport and pushes
          // the document 12px wide, which scrollbars the whole app.
          "relative hidden md:flex flex-col border-r border-border bg-card transition-all duration-200 shrink-0",
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
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        <GlobalSearch />
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/80 backdrop-blur-sm">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <ForgeHexLogo size={28} className="min-w-0" titleClassName="text-sm font-medium" />
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => { const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }); window.dispatchEvent(e); }}
              className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 border border-border/50 rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors"
            >
              <Search className="h-3 w-3" />
              <span>Buscar</span>
              <kbd className="text-[10px] bg-background/60 px-1 py-0.5 rounded border">⌘K</kbd>
            </button>
            <ReportingQuickActions isAdmin={role === 'admin'} />
            <NotificationCenter />
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex h-16 shrink-0 items-center justify-between px-5 border-b border-border/50 bg-card/60 backdrop-blur-sm">
          {/* The brand mark already sits in the sidebar at the same height, so
              this slot carries the trail instead of a second copy of it. */}
          <Breadcrumbs className="min-w-0 flex-1 pr-4" />
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => { const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }); window.dispatchEvent(e); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 border border-border/50 rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors"
            >
              <Search className="h-3 w-3" />
              <span>Buscar</span>
              <kbd className="text-[10px] bg-background/60 px-1 py-0.5 rounded border">Ctrl+K</kbd>
            </button>
            <ReportingQuickActions isAdmin={role === 'admin'} />
            <NotificationCenter />
          </div>
        </div>

        {/* Mobile breadcrumbs — its own row, since the mobile header has no
            room next to the menu button and the actions. */}
        <div className="md:hidden flex shrink-0 items-center border-b border-border/50 bg-card/40 px-4 py-1.5">
          <Breadcrumbs className="min-w-0 flex-1 text-xs" />
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
