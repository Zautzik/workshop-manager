'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Wallet, BadgeCheck, CalendarDays, Gift, ShieldCheck, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

const HrManagerDashboard = () => {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <header className="border-b border-primary/20 shadow-lg sticky top-0 z-50 backdrop-blur-sm bg-card/95">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/gonsa-logo.jpg" alt="Gonsa" className="h-12" />
            <div>
              <h1 className="text-2xl font-bold text-primary">HR Manager</h1>
              <p className="text-xs text-muted-foreground">People Ops and Compliance</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => router.push('/workflow')}
              variant="outline"
              className="border-primary/30 text-primary hover:bg-primary/10"
            >
              {t('workflow')}
            </Button>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-primary/30 text-primary hover:bg-primary/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-primary">HR Management</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manage employee records, compensation plans, skills, leave, incentives, and compliance.
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="profiles" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="profiles">
              <Users className="mr-2 h-4 w-4" />
              Employee Profiles
            </TabsTrigger>
            <TabsTrigger value="compensation">
              <Wallet className="mr-2 h-4 w-4" />
              Compensation
            </TabsTrigger>
            <TabsTrigger value="skills">
              <BadgeCheck className="mr-2 h-4 w-4" />
              Skills
            </TabsTrigger>
            <TabsTrigger value="leave">
              <CalendarDays className="mr-2 h-4 w-4" />
              Leave
            </TabsTrigger>
            <TabsTrigger value="incentives">
              <Gift className="mr-2 h-4 w-4" />
              Incentives
            </TabsTrigger>
            <TabsTrigger value="compliance">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Compliance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profiles">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Employee Profiles</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Placeholder shell for profile search, filters, and detail panels.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compensation">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Compensation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Placeholder shell for rates, history, and payroll impact.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skills">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Placeholder shell for skill matrix, certifications, and gap analysis.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leave">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Leave</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Placeholder shell for balances, requests, and approvals.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incentives">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Incentives</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Placeholder shell for incentive rules and awards.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Placeholder shell for audits, policy checks, and risk alerts.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default HrManagerDashboard;
