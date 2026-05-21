/**
 * @fileoverview Login Page Component
 * 
 * SYSTEM ROLE: Authentication Entry Point
 * ORGAN ANALOGY: The "Front Gate" - First point of user interaction, checks credentials
 * 
 * This component provides:
 * - Email and password input fields
 * - Authentication via signIn() from AuthContext
 * - Theme toggle (light/dark mode)
 * - Language selector (English/Spanish)
 * - Auto-redirect after login based on user role:
 *   - admin -> /admin
 *   - supervisor -> /supervisor
 *   - others -> /manager
 * - Error/success toast notifications
 * 
 * Also handles loading state and prevents re-renders if already authenticated.
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
import { Moon, Sun, Globe } from 'lucide-react';
import { toast } from 'sonner';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [didLogin, setDidLogin] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { signIn, signOut, user, role } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (didLogin && user) {
      // All roles go to the unified home dashboard
      router.push('/home');
    }
  }, [didLogin, user, role, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast.error(error.message);
      setLoading(false);
    } else {
      toast.success(t('login') + ' successful');
      setDidLogin(true);
      // useEffect will handle redirect once session updates
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // If already authenticated, show continue/sign-out actions instead of auto-redirect
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-primary/20 bg-card p-6 text-center shadow-xl">
          <h2 className="text-xl font-semibold text-foreground">Already signed in</h2>
          <p className="text-sm text-muted-foreground">
            Choose where to go next or sign out to switch accounts.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                router.push('/home');
              }}
            >
              Continue to Dashboard
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                router.push('/');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      <nav className="absolute top-4 right-4 flex gap-2" aria-label="Theme and language settings">
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
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
          className="hover:bg-primary/10"
          aria-label={`Switch to ${language === 'en' ? 'Spanish' : 'English'}`}
        >
          <Globe className="h-5 w-5" aria-hidden="true" />
          <span className="ml-1 text-xs">{language.toUpperCase()}</span>
        </Button>
      </nav>

      <Card className="w-full max-w-md shadow-xl border-primary/20">
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
              aria-label={loading ? 'Logging in...' : 'Login to dashboard'}
            >
              {loading ? 'Logging in...' : t('login')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;