'use client';

import { useState, useEffect } from 'react';
import { useNavigate } from '@/lib/navigation';
import { Button } from '@/components/ui/button';
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
  const { signIn, user, role } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && role) {
      if (role === 'admin') navigate('/admin');
      else if (role === 'supervisor') navigate('/supervisor');
      else navigate('/manager');
    }
  }, [user, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('login') + ' successful');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      <nav className="absolute top-4 right-4 flex gap-2" aria-label="Theme and language settings">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
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
          <img 
            src="/gonsa-logo.jpg" 
            alt="Gonsa Impresores - Print shop management system logo" 
            className="h-20 mx-auto object-contain"
          />
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            PrintPress Manager
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
                placeholder="user@gonsa.cl"
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