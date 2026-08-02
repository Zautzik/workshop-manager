'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ForgeHexLogo } from '@/components/branding/ForgeHexLogo';
import { cn } from '@/lib/utils';
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
  Menu,
  Search,
  ChevronDown,
} from 'lucide-react';
import { HEADER_ICON, HEADER_ICON_BUTTON } from '@/components/shell/header-controls';
import { HOME_ITEM, MODULES } from '@/lib/navigation';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ReportingQuickActions } from '@/components/ReportingQuickActions';
import { GlobalSearch } from '@/components/GlobalSearch';
import QuickLinks from '@/components/home/QuickLinks';
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
  // Accordion: at most one nav group open at a time, so the sidebar can't grow
  // past the viewport once several groups have been visited.
  const [expandedNav, setExpandedNav] = useState<string | null>(null);
  const toggleExpanded = (href: string) =>
    setExpandedNav(prev => (prev === href ? null : href));

  useCostOverrunAlerts();

  // One menu button for both breakpoints. Reading the media query at click time
  // rather than during render keeps the markup identical on server and client,
  // so there is nothing for hydration to disagree about.
  const toggleSideMenu = () => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setCollapsed((prev) => !prev);
    } else {
      setMobileOpen((prev) => !prev);
    }
  };

  // Resolved after mount for the same reason — `navigator` has no server value.
  const searchHint = !mounted
    ? ''
    : /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
      ? '⌘K'
      : 'Ctrl+K';

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
    if (parent) setExpandedNav(parent.href);
  }, [pathname]);

  // Public routes — no shell needed
  const isPublicRoute = pathname === '/' || pathname === '/login';
  const isFullscreenRoute = pathname === '/estacion' || pathname === '/operaciones/whatsapp/operator' || pathname.startsWith('/track/');

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

  // A plain element, not a component: declaring `const SidebarContent = () => ...`
  // here mints a new component type on every render, so React remounts the whole
  // sidebar on each state change and CSS transitions never get a start state.
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Rail head. On desktop this carries the menu button, which keeps the
          content area's top-left corner free for each page's own title. */}
      <div className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-3",
        collapsed && "justify-center px-2"
      )}>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSideMenu}
              aria-label="Alternar menú lateral"
              className={cn(HEADER_ICON_BUTTON, 'hidden md:inline-flex')}
            >
              <Menu className={HEADER_ICON} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? 'Expandir menú' : 'Contraer menú'}
          </TooltipContent>
        </Tooltip>
        {!collapsed && <ForgeHexLogo size={26} subtitle={role?.replace('_', ' ')} />}
        {/* The drawer has no rail button, so it keeps the mark. */}
        <span className="md:hidden">
          <ForgeHexLogo size={26} subtitle={role?.replace('_', ' ')} />
        </span>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-0.5 px-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const hasChildren = !!item.children?.length;
            const isExpanded = expandedNav === item.href;
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

            // Open/close animates via the grid 0fr→1fr trick: it interpolates to the
            // content's natural height without measuring it in JS. `visibility` is in
            // the same transition so the collapsed rows leave the tab order only once
            // the animation has finished (CSS keeps it visible for the whole run).
            const subMenu = hasChildren && !collapsed ? (
              <div className={cn(
                "grid transition-[grid-template-rows] duration-100 ease-out motion-reduce:transition-none",
                isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}>
                <div className={cn(
                  "overflow-hidden transition-[visibility,opacity] duration-100 ease-out motion-reduce:transition-none",
                  isExpanded ? "visible opacity-100" : "invisible opacity-0"
                )}>
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
                </div>
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
        {sidebarContent}
      </aside>

      {/* Desktop sidebar — collapsing is driven by the top bar's menu button, so
          there is no floating chevron. The old one was `absolute` inside a
          `static` aside, which anchored it to the viewport instead of the rail:
          it landed at the far right of the screen and pushed the document 12px
          wider than the window. */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-card transition-all duration-200",
          collapsed ? "w-[56px]" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <GlobalSearch />

        {/* Top bar. It floats over the content instead of occupying a row of its
            own — a 56px band whose middle was always empty was costing every
            page a fifth of a viewport that never scrolls. `pointer-events-none`
            on the strip means only the controls themselves intercept clicks;
            the page underneath stays fully usable. */}
        <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-1 px-2 sm:px-3">
          {/* Below md there is no rail, so the menu button and the brand live
              here. From md up the rail head carries them and this side stays
              empty, leaving the corner to each page's own title. */}
          <div className="pointer-events-auto flex min-w-0 items-center gap-2.5 md:hidden">
            <button
              type="button"
              onClick={toggleSideMenu}
              aria-label="Abrir menú lateral"
              className={cn(HEADER_ICON_BUTTON, 'bg-card/70 backdrop-blur-sm')}
            >
              <Menu className={HEADER_ICON} />
            </button>
            <ForgeHexLogo size={26} showWordmark={false} />
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              GonsAdmin
            </span>
          </div>

          {/* Everything that wants the top-right corner shares this row. Home's
              quick-links pill used to position itself against the viewport from
              inside the page, which put it underneath this cluster — anything
              that belongs up here has to be a sibling of it, not a second
              free-floating overlay. */}
          <div className="pointer-events-auto ml-auto flex min-w-0 items-center gap-2">
            {pathname === '/home' && <QuickLinks />}

            {/* One blurred cluster so the three controls stay legible over whatever
                the page happens to render underneath them. */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border/40 bg-card/70 p-0.5 backdrop-blur-sm">
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => { const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }); window.dispatchEvent(e); }}
                    aria-label="Buscar"
                    className={HEADER_ICON_BUTTON}
                  >
                    <Search className={HEADER_ICON} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Buscar
                  {searchHint && <span className="ml-1.5 text-muted-foreground">{searchHint}</span>}
                </TooltipContent>
              </Tooltip>

              <ReportingQuickActions isAdmin={role === 'admin'} />
              <NotificationCenter />
            </div>
          </div>
        </header>

        {/* Page content — full height now that nothing sits above it. The top
            padding below md clears the floating brand; from md up the rail head
            holds those controls and the page starts at the very top. */}
        <div className="flex-1 overflow-y-auto pt-14 md:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}
