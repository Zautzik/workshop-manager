'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface UserManagementProps {
  onUpdate: () => void;
}

const UserManagement = ({ onUpdate }: UserManagementProps) => {
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'supervisor' as any,
    department: '',
    manager_domain: '',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('*');
    
    if (error) {
      toast.error('Error loading users');
      return;
    }
    
    const usersWithEmails = (roles || []).map((role: any) => {
      const authUser = authUsers?.users.find((u: any) => u.id === role.user_id);
      return {
        ...role,
        email: authUser?.email || 'Unknown',
      };
    });
    
    setUsers(usersWithEmails);
  };

  const handleSubmit = async () => {
    if (editingUser) {
      // Update existing user role
      const { error } = await supabase
        .from('user_roles')
        .update({
          role: formData.role,
          department: formData.department || null,
          manager_domain: formData.manager_domain || null,
        })
        .eq('id', editingUser.id);

      if (error) {
        toast.error('Error updating user');
      } else {
        toast.success('User updated successfully');
        fetchUsers();
        onUpdate();
        resetForm();
      }
    } else {
      // Create new user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        toast.error(authError.message);
        return;
      }

      if (authData.user) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: formData.role,
            department: formData.department || null,
            manager_domain: formData.manager_domain || null,
          } as any);

        if (roleError) {
          toast.error('Error creating user role');
        } else {
          toast.success('User created successfully');
          fetchUsers();
          onUpdate();
          resetForm();
        }
      }
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm(t('confirmDelete'))) return;

    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('id', userId);

    if (error) {
      toast.error('Error deleting user');
    } else {
      toast.success('User deleted successfully');
      fetchUsers();
      onUpdate();
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      role: 'supervisor',
      department: '',
      manager_domain: '',
    });
    setEditingUser(null);
    setShowDialog(false);
  };

  const openEditDialog = (user: any) => {
    setEditingUser(user);
    setFormData({
      email: '',
      password: '',
      role: user.role,
      department: user.department || '',
      manager_domain: user.manager_domain || '',
    });
    setShowDialog(true);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-primary text-primary-foreground';
      case 'manager': return 'bg-manager text-manager-foreground';
      case 'supervisor': return 'bg-supervisor text-supervisor-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <div>
          <CardTitle className="text-2xl">{t('userManagement')}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Manage user accounts and assign roles
          </p>
        </div>
        <Button 
          onClick={() => setShowDialog(true)} 
          className="bg-primary hover:bg-primary/90"
          aria-label="Add new user"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('addUser')}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table aria-label="User management table">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold" scope="col">{t('email')}</TableHead>
                <TableHead className="font-semibold" scope="col">{t('role')}</TableHead>
                <TableHead className="font-semibold" scope="col">{t('department')}</TableHead>
                <TableHead className="text-right font-semibold" scope="col">{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No users found. Add your first user to get started.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                        {user.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.department || '-'}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          className="hover:bg-primary/10 hover:text-primary hover:border-primary"
                          aria-label={`Edit user ${user.email}`}
                        >
                          <Pencil className="h-4 w-4 mr-1" aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(user.id)}
                          className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                          aria-label={`Delete user ${user.email}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]" aria-describedby="user-dialog-description">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {editingUser ? t('editUser') : t('addUser')}
            </DialogTitle>
            <DialogDescription id="user-dialog-description" className="text-base">
              {editingUser ? 'Update user role and details' : 'Create a new user account with role assignment'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {!editingUser && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <h4 className="font-semibold text-sm">Account Credentials</h4>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('email')}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="user@gonsa.cl"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    aria-required="true"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('password')}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    aria-required="true"
                    autoComplete="new-password"
                    minLength={6}
                    aria-describedby="password-requirements"
                  />
                  <p id="password-requirements" className="text-xs text-muted-foreground sr-only">
                    Password must be at least 6 characters long
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="role" className="text-base font-semibold">User Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
                required
                aria-required="true"
              >
                <SelectTrigger className="h-11" id="role" aria-label="Select user role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-supervisor" />
                      <div>
                        <div className="font-medium">Supervisor</div>
                        <div className="text-xs text-muted-foreground">Manages workers, jobs, and production</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-manager" />
                      <div>
                        <div className="font-medium">Manager</div>
                        <div className="text-xs text-muted-foreground">Views reports and analytics</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <div>
                        <div className="font-medium">Admin</div>
                        <div className="text-xs text-muted-foreground">Full system access and user management</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(formData.role === 'supervisor' || formData.role === 'manager') && (
              <div className="space-y-2">
                <Label htmlFor="department">{t('department')}</Label>
                <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
                  <SelectTrigger id="department" aria-label="Select department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="press">{t('press')}</SelectItem>
                    <SelectItem value="manual_workshop">{t('manual_workshop')}</SelectItem>
                    <SelectItem value="deliveries">{t('deliveries')}</SelectItem>
                    <SelectItem value="pre_press">{t('pre_press')}</SelectItem>
                    <SelectItem value="administration">{t('administration')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.role === 'manager' && (
              <div className="space-y-2">
                <Label htmlFor="manager_domain">{t('managerDomain')}</Label>
                <Select value={formData.manager_domain} onValueChange={(value) => setFormData({ ...formData, manager_domain: value })}>
                  <SelectTrigger id="manager_domain" aria-label="Select manager domain">
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cost">{t('cost')}</SelectItem>
                    <SelectItem value="efficiency">{t('efficiency')}</SelectItem>
                    <SelectItem value="production">{t('production')}</SelectItem>
                    <SelectItem value="quality">{t('quality')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90">
              {editingUser ? t('saveChanges') : t('createUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default UserManagement;
