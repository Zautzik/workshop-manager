/**
 * @fileoverview Login Page Component
 * 
 * SYSTEM ROLE: Authentication Entry Point
 * 
 * This component provides:
 * - Email and password input fields
 * - Authentication via signIn() from AuthContext
 * - Theme toggle (light/dark mode)
 * - Language selector (English/Spanish)
 * - Auto-redirect for anyone holding a session, by role — see
 *   landingRouteForRole() in @/lib/navigation
 * - Error/success toast notifications
 * 
 * Also handles loading state. Visitors who already hold a session never see the
 * form — they are redirected straight to their landing route.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ForgeHexLogo } from '@/components/branding/ForgeHexLogo';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { landingRouteForRole } from '@/lib/navigation';
import { Moon, Sun } from 'lucide-react';
import WatercolorBackdrop from '@/components/branding/WatercolorBackdrop';
import { toast } from 'sonner';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { signIn, user, role } = useAuth();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Anyone who reaches this page with a session gets sent straight on — whether
  // they just signed in or navigated to /login while already authenticated.
  // Land each role on the surface it's allowed to use (technician → WhatsApp,
  // vendedor → Comercial, ops roles → Home). `replace` keeps the login page out
  // of history so Back doesn't return here.
  useEffect(() => {
    if (user) {
      router.replace(landingRouteForRole(role));
    }
  }, [user, role, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast.error(error.message);
      setLoading(false);
    } else {
      toast.success('Sesión iniciada');
      // Stay in the loading state — the effect above redirects once the
      // session lands, so the form must not become interactive again.
    }
  };

  // Before hydration, and while the effect above redirects an authenticated
  // visitor away, show the placeholder rather than flashing the login form.
  if (!mounted || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
        <div className="text-sm text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background p-4">
      <WatercolorBackdrop intensity="hero" />
      <nav className="absolute top-4 right-4 z-10 flex gap-2" aria-label="Theme and language settings">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="hover:bg-primary/10"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          <span className="sr-only">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
        </Button>
      </nav>

      <Card className="relative z-10 w-full max-w-md border-primary/20 bg-card/85 shadow-xl backdrop-blur-sm">
        <CardHeader className="text-center space-y-4">
          <ForgeHexLogo size={80} showWordmark={false} className="justify-center" />
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            GonsAdmin
          </CardTitle>
          <CardDescription className="text-base">{t('login')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Login form">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-required="true"
                autoComplete="email"
                className="border-primary/30 focus:border-primary"
                placeholder="user@gonsadmin.app"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-required="true"
                autoComplete="current-password"
                className="border-primary/30 focus:border-primary"
                placeholder="••••••••"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 transition-all" 
              disabled={loading}
              aria-label={loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            >
              {loading ? 'Iniciando sesión...' : t('login')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
