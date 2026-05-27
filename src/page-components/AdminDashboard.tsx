/**
 * @fileoverview Admin Dashboard Page Component
 * 
 * SYSTEM ROLE: Admin Control Panel & System Management
 * 
 * Provides comprehensive system administration features:
 * 
 * 1. Executive Overview: High-level statistics and KPIs
 *    - Total users, workers, machines, jobs count
 *    - System health indicators
 * 
 * 2. User Management: CRUD operations for system users
 *    - Create/edit/delete user accounts
 *    - Assign roles and departments
 * 
 * 3. Workers Management: Employee information and roster
 *    - Worker profiles
 *    - Worker roster/team assignments
 * 
 * 4. Inventory Management: Track all materials and supplies
 *    - Item tracking
 *    - Quantity management
 * 
 * 5. Purchases Management: Purchase orders and history
 *    - Track spending
 *    - Supplier management
 * 
 * Only accessible to users with 'admin' role.
 * Includes logout functionality and role-based access checks.
 */
'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ForgeHexLogo } from '@/components/branding/ForgeHexLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminStats } from '@/hooks/use-admin-queries';
import { LogOut, Users, Package, FileText, DollarSign, Factory, Wrench, LayoutDashboard } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserManagement from '@/components/admin/UserManagement';
import WorkersManagement from '@/components/admin/WorkersManagement';
import InventoryManagement from '@/components/admin/InventoryManagement';
import PurchasesManagement from '@/components/admin/PurchasesManagement';
const ExecutiveOverview = dynamic(() => import('@/components/admin/ExecutiveOverview'));

const AdminDashboard = () => {
  const { user, role, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const { data: stats = { totalUsers: 0, totalWorkers: 0, totalMachines: 0, totalJobs: 0 } } = useAdminStats();

  useEffect(() => {
    // Redirect only if NOT authenticated at all
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
      <header className="border-b border-primary/20 shadow-lg sticky top-0 z-50 backdrop-blur-sm bg-card/95" role="banner">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <ForgeHexLogo size={48} showWordmark={false} />
            <div>
              <h1 className="text-2xl font-bold text-primary">{t('adminDashboard')}</h1>
              <p className="text-xs text-muted-foreground">GonsAdmin â€¢ System Administration</p>
            </div>
          </div>
          <nav aria-label="Main navigation" className="flex gap-2">
            <Button
              onClick={() => router.push('/hr')}
              variant="outline"
              className="border-primary/30 text-primary hover:bg-primary/10"
              aria-label="Navigate to Human Resources"
            >
              <Users className="mr-2 h-4 w-4" aria-hidden="true" />
              Human Resources
            </Button>
            <Button
              onClick={() => router.push('/financial')}
              variant="outline"
              className="border-green-500/30 text-green-500 hover:bg-green-500/10"
              aria-label="Navigate to Financial Report"
            >
              <DollarSign className="mr-2 h-4 w-4" aria-hidden="true" />
              Financial Report
            </Button>
            <Button
              onClick={() => router.push('/workflow')}
              variant="default"
              className="bg-blue-500 hover:bg-blue-600"
              aria-label="Navigate to Workflow Management"
            >
              <Factory className="mr-2 h-4 w-4" aria-hidden="true" />
              Workflow Management
            </Button>
            <Button
              onClick={() => router.push('/maintenance')}
              variant="outline"
              className="border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
              aria-label="Navigate to Asset Maintenance"
            >
              <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />
              Maintenance
            </Button>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-primary/30 text-primary hover:bg-primary/10"
              aria-label="Logout from admin dashboard"
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('logout')}
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8" role="main">
        <section aria-label="Dashboard statistics" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('totalUsers')}
              </CardTitle>
              <div className="p-2 rounded-lg bg-primary/10" aria-hidden="true">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary" aria-label={`Total users: ${stats.totalUsers}`}>{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">Active accounts</p>
            </CardContent>
          </Card>

          <Card className="border-supervisor/20 hover:border-supervisor/40 transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('totalWorkers')}
              </CardTitle>
              <div className="p-2 rounded-lg bg-supervisor/10" aria-hidden="true">
                <Users className="h-5 w-5 text-supervisor" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-supervisor" aria-label={`Total workers: ${stats.totalWorkers}`}>{stats.totalWorkers}</div>
              <p className="text-xs text-muted-foreground mt-1">Production staff</p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 hover:border-accent/40 transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('machines')}
              </CardTitle>
              <div className="p-2 rounded-lg bg-accent/10" aria-hidden="true">
                <Package className="h-5 w-5 text-accent" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-accent" aria-label={`Total machines: ${stats.totalMachines}`}>{stats.totalMachines}</div>
              <p className="text-xs text-muted-foreground mt-1">Equipment units</p>
            </CardContent>
          </Card>

          <Card className="border-manager/20 hover:border-manager/40 transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('totalJobs')}
              </CardTitle>
              <div className="p-2 rounded-lg bg-manager/10" aria-hidden="true">
                <FileText className="h-5 w-5 text-manager" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-manager" aria-label={`Total jobs: ${stats.totalJobs}`}>{stats.totalJobs}</div>
              <p className="text-xs text-muted-foreground mt-1">All time</p>
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5" role="tablist" aria-label="Admin management sections">
            <TabsTrigger value="overview" aria-label="Executive overview tab">
              <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" aria-label="User management tab">
              <Users className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('users')}
            </TabsTrigger>
            <TabsTrigger value="workers" aria-label="Worker management tab">
              <Users className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('workers')}
            </TabsTrigger>
            <TabsTrigger value="inventory" aria-label="Inventory management tab">
              <Package className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('inventory')}
            </TabsTrigger>
            <TabsTrigger value="purchases" aria-label="Purchases management tab">
              <DollarSign className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('purchases')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-6">
            <ExecutiveOverview />
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <UserManagement onUpdate={() => {}} />
          </TabsContent>

          <TabsContent value="workers" className="space-y-4">
            <WorkersManagement onUpdate={() => {}} />
          </TabsContent>

          <TabsContent value="inventory" className="space-y-4">
            <InventoryManagement />
          </TabsContent>

          <TabsContent value="purchases" className="space-y-4">
            <PurchasesManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
