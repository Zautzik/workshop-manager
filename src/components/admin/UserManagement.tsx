'use client';
import { useState, useEffect, useCallback } from 'react';
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
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, KeyRound } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AppRole = 'admin' | 'manager' | 'supervisor' | 'hr_manager' | 'technician';

interface UserRow {
  id: string;
  user_id: string;
  email: string;
  role: AppRole;
  department: string | null;
  manager_domain: string | null;
}

interface UserManagementProps {
  onUpdate: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const UserManagement = ({ onUpdate }: UserManagementProps) => {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'supervisor' as AppRole,
    department: '',
    manager_domain: '',
  });

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        toast.error('Error al cargar usuarios');
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error('No se pudieron obtener los usuarios');
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ----- Create / Update ----------------------------------------- */

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (editingUser) {
        // Update existing user role via API
        const res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingUser.id,
            role: formData.role,
            department: formData.department || null,
            manager_domain: formData.manager_domain || null,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error ?? 'Error al actualizar usuario');
          return;
        }

        toast.success('Usuario actualizado correctamente');
      } else {
        // Create new user via secure server-side API
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            role: formData.role,
            department: formData.department || null,
            manager_domain: formData.manager_domain || null,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error ?? 'Error al crear usuario');
          return;
        }

        toast.success('Usuario creado correctamente');
      }

      fetchUsers();
      onUpdate();
      resetForm();
    } finally {
      setLoading(false);
    }
  };

  /* ----- Delete --------------------------------------------------- */

  const handleDelete = async (userId: string) => {
    if (!confirm(t('confirmDelete'))) return;

    const res = await fetch(`/api/admin/users?id=${userId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Error al eliminar usuario');
      return;
    }

    toast.success('Usuario eliminado correctamente');
    fetchUsers();
    onUpdate();
  };

  /* ----- Form helpers --------------------------------------------- */

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

  // ── Password control ──────────────────────────────────────────────────────
  // An admin can replace a password or hand the user a recovery link. Nobody can
  // read an existing one: Supabase stores a one-way hash, which is correct.
  const openPasswordDialog = (user: UserRow) => {
    setPasswordUser(user);
    setNewPassword('');
    setRecoveryLink(null);
    setPasswordDialogOpen(true);
  };

  const submitPassword = async () => {
    if (!passwordUser) return;
    setPasswordBusy(true);
    try {
      const res = await fetch('/api/admin/users/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'set', user_id: passwordUser.id, password: newPassword }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = body?.details?.password?.[0];
        throw new Error(detail || body?.error || 'No se pudo cambiar la contraseña');
      }
      toast.success(
        body?.sessions_revoked
          ? 'Contraseña actualizada — se cerraron las sesiones abiertas de esa persona'
          : 'Contraseña actualizada'
      );
      setPasswordDialogOpen(false);
      setNewPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setPasswordBusy(false);
    }
  };

  const requestRecoveryLink = async () => {
    if (!passwordUser) return;
    setPasswordBusy(true);
    try {
      const res = await fetch('/api/admin/users/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'send_recovery', user_id: passwordUser.id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'No se pudo generar el enlace');
      setRecoveryLink(body?.recovery_link ?? null);
      toast.success('Enlace de recuperación generado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar el enlace');
    } finally {
      setPasswordBusy(false);
    }
  };

  const openEditDialog = (user: UserRow) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      role: user.role,
      department: user.department ?? '',
      manager_domain: user.manager_domain ?? '',
    });
    setShowDialog(true);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-primary text-primary-foreground';
      case 'manager': return 'bg-manager text-manager-foreground';
      case 'supervisor': return 'bg-supervisor text-supervisor-foreground';
      case 'technician': return 'bg-orange-500 text-white';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  /* ----- Render --------------------------------------------------- */

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <div>
          <CardTitle className="text-2xl">{t('userManagement')}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t('addUserDescription')}
          </p>
        </div>
        <Button 
          onClick={() => setShowDialog(true)} 
          className="bg-primary hover:bg-primary/90"
          aria-label="Agregar nuevo usuario"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('addUser')}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table aria-label="Tabla de gestión de usuarios">
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
                    {t('noData')}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                        {t(user.role)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.department ? t(user.department) : '-'}</TableCell>
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
                          {t('edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPasswordDialog(user)}
                          className="hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500"
                          aria-label={`Cambiar contraseña de ${user.email}`}
                        >
                          <KeyRound className="h-4 w-4 mr-1" aria-hidden="true" />
                          Contraseña
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(user.id)}
                          className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                          aria-label={`Delete user ${user.email}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                          {t('delete')}
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
              {editingUser ? t('editUserDescription') : t('addUserDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {!editingUser && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <h4 className="font-semibold text-sm">{t('email')} &amp; {t('password')}</h4>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('email')}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="user@gonsadmin.app"
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
                    placeholder="Mínimo 6 caracteres"
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
              <Label htmlFor="role" className="text-base font-semibold">{t('role')} *</Label>
              <Select
                value={formData.role}
                onValueChange={(value: string) => setFormData({ ...formData, role: value as AppRole })}
                required
                aria-required="true"
              >
                <SelectTrigger className="h-11" id="role" aria-label="Seleccionar rol de usuario">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-supervisor" />
                      <div>
                        <div className="font-medium">{t('supervisor')}</div>
                        <div className="text-xs text-muted-foreground">Administra trabajadores, trabajos y producción</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-manager" />
                      <div>
                        <div className="font-medium">{t('manager')}</div>
                        <div className="text-xs text-muted-foreground">Views reports and analytics</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="hr_manager">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-cyan-500" />
                      <div>
                        <div className="font-medium">HR Manager</div>
                        <div className="text-xs text-muted-foreground">Administra contratos, licencias, incentivos y documentos de RR.HH.</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="technician">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <div>
                        <div className="font-medium">{t('technician')}</div>
                        <div className="text-xs text-muted-foreground">Ejecuta listas de verificación de mantenimiento</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <div>
                        <div className="font-medium">{t('admin')}</div>
                        <div className="text-xs text-muted-foreground">Acceso total al sistema y gestión de usuarios</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(formData.role === 'supervisor' || formData.role === 'manager' || formData.role === 'hr_manager' || formData.role === 'technician') && (
              <div className="space-y-2">
                <Label htmlFor="department">{t('department')}</Label>
                <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
                  <SelectTrigger id="department" aria-label="Seleccionar departamento">
                    <SelectValue placeholder="Seleccionar departamento" />
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
                  <SelectTrigger id="manager_domain" aria-label="Seleccionar dominio de gestión">
                    <SelectValue placeholder="Seleccionar dominio" />
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
            <Button onClick={handleSubmit} disabled={loading} className="bg-primary hover:bg-primary/90">
              {loading ? t('common.loading') : editingUser ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Password control (admin only) ─────────────────────────────────── */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contraseña de {passwordUser?.email}</DialogTitle>
            <DialogDescription>
              Puedes asignar una contraseña nueva o entregarle un enlace para que la elija.
              Las contraseñas existentes no se pueden ver: se guardan cifradas en un solo
              sentido, que es como debe ser.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">Nueva contraseña</Label>
              <Input
                id="new_password"
                type="text"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 10 caracteres, con letras y números"
              />
              <p className="text-xs text-muted-foreground">
                Se muestra en claro a propósito: la vas a dictar en persona. Al guardar se
                cierran todas las sesiones abiertas de esa persona.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">o</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={requestRecoveryLink}
              disabled={passwordBusy}
            >
              Generar enlace de recuperación
            </Button>

            {recoveryLink && (
              <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Entrégale este enlace. Caduca y sirve una sola vez.
                </p>
                <textarea
                  readOnly
                  value={recoveryLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full resize-none rounded border border-border bg-background p-2 font-mono text-[11px]"
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPasswordDialogOpen(false)}
              disabled={passwordBusy}
            >
              Cerrar
            </Button>
            <Button onClick={submitPassword} disabled={passwordBusy || !newPassword.trim()}>
              {passwordBusy ? 'Guardando…' : 'Asignar contraseña'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default UserManagement;
