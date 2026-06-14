"use client";

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Wallet,
  BadgeCheck,
  CalendarDays,
  Gift,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  hrQueryKeys,
  useEmployees,
  useEmploymentContracts,
  useCompensationHistory,
  useLeaveRequests,
} from '@/hooks/use-employees';
const SkillTreeManager = dynamic(() => import('@/components/hr/SkillTreeManager'));
const WorkerSkillsProficiency = dynamic(() => import('@/components/hr/WorkerSkillsProficiency'));
const CraftSkillTree = dynamic(() => import('@/components/hr/CraftSkillTree'));

const HrManagerDashboard = () => {
  const { role } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canManageHR = role === 'admin' || role === 'hr_manager';
  const canViewHR = role === 'admin' || role === 'hr_manager' || role === 'supervisor';
  const {
    data: employees = [],
    isLoading: employeesLoading,
    error: employeesError,
  } = useEmployees();

  if (!canViewHR) {
    return (
      <div className="p-6 md:p-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Acceso Restringido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Esta sección está disponible solo para Admin, HR Manager o Supervisor.
            </p>
            <Button variant="outline" onClick={() => router.push('/home')}>
              Volver
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [compDialogOpen, setCompDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [incentiveRuleDialogOpen, setIncentiveRuleDialogOpen] = useState(false);
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [accrualLoading, setAccrualLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [employeeForm, setEmployeeForm] = useState({
    id: '',
    full_name: '',
    department: '',
    hire_date: '',
    status: 'active',
    email: '',
    phone: '',
  });

  const [compensationForm, setCompensationForm] = useState({
    employee_id: '',
    hourly_rate: '',
    currency_code: 'USD',
    effective_from: '',
    effective_to: '',
  });

  const [leaveForm, setLeaveForm] = useState({
    employee_id: '',
    leave_type: 'vacation',
    start_date: '',
    end_date: '',
    hours_requested: '',
  });

  const [skillForm, setSkillForm] = useState({
    employee_id: '',
    skill_id: '',
    proficiency_level: '1',
    certified: false,
  });

  const [incentiveRuleForm, setIncentiveRuleForm] = useState({
    name: '',
    incentive_type: 'fixed_bonus',
    amount: '',
    currency_code: 'USD',
    is_active: true,
  });

  const [awardForm, setAwardForm] = useState({
    employee_id: '',
    incentive_rule_id: '',
    amount: '',
    awarded_date: '',
  });

  const [documentForm, setDocumentForm] = useState({
    employee_id: '',
    title: '',
    doc_type: 'contract',
    issuer: '',
    issue_date: '',
    expires_on: '',
    reminder_days_before: '30',
    file_url: '',
    notes: '',
  });

  const { data: skills = [], isLoading: skillsLoading, error: skillsError } = useQuery({
    queryKey: [...hrQueryKeys.skills(), 'list'],
    queryFn: async () => {
      const response = await fetch('/api/skills');
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load skills');
      }

      return Array.isArray(payload) ? payload : [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: compensationRates = [] } = useQuery({
    queryKey: ['hr', 'compensationRates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compensation_rates')
        .select('id, employee_id, hourly_rate, currency_code, effective_from, effective_to')
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: employmentContracts = [] } = useQuery({
    queryKey: ['hr', 'employmentContracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employment_contracts')
        .select('id, employee_id, contract_type, start_date, end_date, overtime_allowed')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['hr', 'leaveRequests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, employee_id, leave_type, status, start_date, end_date, hours_requested')
        .order('start_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ['hr', 'leaveBalances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_balances')
        .select('id, employee_id, leave_type, balance_hours, as_of')
        .order('as_of', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: incentiveRules = [] } = useQuery({
    queryKey: ['hr', 'incentiveRules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_rules')
        .select('id, name, incentive_type, amount, currency_code, is_active')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: incentiveAwards = [] } = useQuery({
    queryKey: ['hr', 'employeeIncentives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_incentives')
        .select('id, employee_id, amount, currency_code, status, awarded_date')
        .order('awarded_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: hrDocuments = [] } = useQuery({
    queryKey: ['hr', 'documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_documents')
        .select('id, employee_id, title, doc_type, issuer, issue_date, expires_on, remind_on, status, file_url, employees(full_name, department)')
        .order('expires_on', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { employeeStats, departmentCount, activeEmployees } = useMemo(() => {
    const departments = new Set<string>();
    let active = 0;
    employees.forEach((employee: any) => {
      if (employee.department) {
        departments.add(employee.department);
      }
      if (employee.status === 'active') {
        active += 1;
      }
    });
    return {
      employeeStats: employees.length,
      departmentCount: departments.size,
      activeEmployees: active,
    };
  }, [employees]);

  const selectedEmployee = useMemo(
    () => employees.find((employee: any) => employee.id === selectedEmployeeId),
    [employees, selectedEmployeeId],
  );

  const compensationCoverage = useMemo(() => {
    const employeeIds = new Set(employees.map((employee: any) => employee.id));
    const compensationIds = new Set(compensationRates.map((rate: any) => rate.employee_id));
    const contractIds = new Set(employmentContracts.map((contract: any) => contract.employee_id));
    let missingComp = 0;
    let missingContracts = 0;
    employeeIds.forEach((id) => {
      if (!compensationIds.has(id)) {
        missingComp += 1;
      }
      if (!contractIds.has(id)) {
        missingContracts += 1;
      }
    });
    return { missingComp, missingContracts };
  }, [employees, compensationRates, employmentContracts]);

  const expiringDocuments = useMemo(() => {
    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() + 45);
    return hrDocuments.filter((doc: any) => {
      if (!doc.expires_on) return false;
      const expires = new Date(doc.expires_on);
      return doc.status !== 'archived' && expires <= cutoff;
    });
  }, [hrDocuments]);

  const employeeContracts = useEmploymentContracts(selectedEmployeeId || '');
  const employeeCompHistory = useCompensationHistory(selectedEmployeeId || '');
  const employeeLeaveRequests = useLeaveRequests(selectedEmployeeId || '');

  const { data: employeeSkills = [] } = useQuery({
    queryKey: ['hr', 'employeeSkills', selectedEmployeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_skills')
        .select('id, proficiency_level, certified, skills(name, category)')
        .eq('employee_id', selectedEmployeeId as string)
        .order('proficiency_level', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedEmployeeId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: employeeLeaveBalances = [] } = useQuery({
    queryKey: ['hr', 'leaveBalances', selectedEmployeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_balances')
        .select('id, leave_type, balance_hours, used_hours, accrued_hours')
        .eq('employee_id', selectedEmployeeId as string)
        .order('leave_type', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedEmployeeId,
    staleTime: 3 * 60 * 1000,
  });

  const openEmployeeDrawer = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setSheetOpen(true);
  };

  const openEmployeeEditor = (employee: any) => {
    setActionError(null);
    setEmployeeForm({
      id: employee?.id || '',
      full_name: employee?.full_name || '',
      department: employee?.department || '',
      hire_date: employee?.hire_date || '',
      status: employee?.status || 'active',
      email: employee?.email || '',
      phone: employee?.phone || '',
    });
    setEmployeeDialogOpen(true);
  };

  const openCompensationDialogFor = (employeeId: string) => {
    setActionError(null);
    setCompensationForm({
      employee_id: employeeId,
      hourly_rate: '',
      currency_code: 'USD',
      effective_from: '',
      effective_to: '',
    });
    setCompDialogOpen(true);
  };

  const openLeaveDialogFor = (employeeId: string) => {
    setActionError(null);
    setLeaveForm({
      employee_id: employeeId,
      leave_type: 'vacation',
      start_date: '',
      end_date: '',
      hours_requested: '',
    });
    setLeaveDialogOpen(true);
  };

  const openSkillDialogFor = (employeeId: string) => {
    setActionError(null);
    setSkillForm({
      employee_id: employeeId,
      skill_id: '',
      proficiency_level: '1',
      certified: false,
    });
    setSkillDialogOpen(true);
  };

  const openAwardDialogFor = (employeeId: string) => {
    setActionError(null);
    setAwardForm({
      employee_id: employeeId,
      incentive_rule_id: '',
      amount: '',
      awarded_date: '',
    });
    setAwardDialogOpen(true);
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      id: '',
      full_name: '',
      department: '',
      hire_date: '',
      status: 'active',
      email: '',
      phone: '',
    });
  };

  const handleEmployeeSave = async () => {
    setActionError(null);
    if (!employeeForm.full_name || !employeeForm.department || !employeeForm.hire_date) {
      setActionError('El nombre completo, el departamento y la fecha de contratación son obligatorios.');
      toast({
        variant: 'destructive',
        title: 'Faltan datos',
        description: 'El nombre completo, el departamento y la fecha de contratación son obligatorios.',
      });
      return;
    }

    const payload = {
      full_name: employeeForm.full_name,
      department: employeeForm.department,
      hire_date: employeeForm.hire_date,
      status: employeeForm.status as any,
      email: employeeForm.email || null,
      phone: employeeForm.phone || null,
    };

    const listKey = hrQueryKeys.employees();
    const previous = (queryClient.getQueryData(listKey) as any[]) || [];
    const optimisticId = employeeForm.id || `temp-${Date.now()}`;
    const optimisticEmployee = {
      ...payload,
      id: optimisticId,
    };

    if (employeeForm.id) {
      queryClient.setQueryData(listKey, (current: any[] = []) =>
        current.map((item) => (item.id === employeeForm.id ? { ...item, ...payload } : item)),
      );
    } else {
      queryClient.setQueryData(listKey, (current: any[] = []) => [optimisticEmployee, ...current]);
    }

    const { data, error } = employeeForm.id
      ? await supabase.from('employees').update(payload).eq('id', employeeForm.id).select('*').single()
      : await supabase.from('employees').insert([payload]).select('*').single();

    if (error) {
      queryClient.setQueryData(listKey, previous);
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'No se pudo actualizar el empleado', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    if (employeeForm.id) {
      queryClient.invalidateQueries({ queryKey: hrQueryKeys.employee(employeeForm.id) });
    }
    queryClient.invalidateQueries({ queryKey: ['workers', 'rating'] });
    queryClient.invalidateQueries({ queryKey: ['monthlyPayroll'] });
    queryClient.invalidateQueries({ queryKey: ['orderLaborMargin'] });
    toast({ title: 'Empleado guardado', description: `${data.full_name} está actualizado.` });
    setEmployeeDialogOpen(false);
    resetEmployeeForm();
  };

  const handleCompensationSave = async () => {
    setActionError(null);
    if (!compensationForm.employee_id || !compensationForm.hourly_rate || !compensationForm.effective_from) {
      setActionError('El empleado, la tarifa por hora y la fecha de vigencia son obligatorios.');
      toast({
        variant: 'destructive',
        title: 'Faltan datos',
        description: 'El empleado, la tarifa por hora y la fecha de vigencia son obligatorios.',
      });
      return;
    }

    const effectiveFrom = Date.parse(compensationForm.effective_from);
    const effectiveTo = compensationForm.effective_to
      ? Date.parse(compensationForm.effective_to)
      : null;

    if (Number.isNaN(effectiveFrom) || (compensationForm.effective_to && Number.isNaN(effectiveTo))) {
      setActionError('Provide valid dates for compensation.');
      toast({ variant: 'destructive', title: 'Fechas inválidas', description: 'Proporcione fechas válidas.' });
      return;
    }

    if (effectiveTo !== null && effectiveTo < effectiveFrom) {
      setActionError('La fecha de fin de vigencia no puede ser anterior a la de inicio.');
      toast({
        variant: 'destructive',
        title: 'Rango de fechas inválido',
        description: 'La fecha de fin de vigencia no puede ser anterior a la de inicio.',
      });
      return;
    }

    const existingRates = compensationRates.filter(
      (rate: any) => rate.employee_id === compensationForm.employee_id,
    );
    const newEnd = effectiveTo ?? Number.POSITIVE_INFINITY;
    const hasOverlap = existingRates.some((rate: any) => {
      const start = Date.parse(rate.effective_from);
      const end = rate.effective_to ? Date.parse(rate.effective_to) : Number.POSITIVE_INFINITY;
      return effectiveFrom <= end && start <= newEnd;
    });

    if (hasOverlap) {
      setActionError('This effective date overlaps an existing rate.');
      toast({
        variant: 'destructive',
        title: 'Tarifa superpuesta',
        description: 'Ajuste las fechas de vigencia para evitar superposición.',
      });
      return;
    }

    const listKey = ['hr', 'compensationRates'];
    const previous = (queryClient.getQueryData(listKey) as any[]) || [];
    const optimisticId = `temp-${Date.now()}`;
    const optimisticRate = {
      id: optimisticId,
      employee_id: compensationForm.employee_id,
      hourly_rate: Number(compensationForm.hourly_rate),
      currency_code: compensationForm.currency_code || 'USD',
      effective_from: compensationForm.effective_from,
      effective_to: compensationForm.effective_to || null,
    };

    queryClient.setQueryData(listKey, (current: any[] = []) => [optimisticRate, ...current]);

    const { data, error } = await supabase.from('compensation_rates').insert([
      {
        employee_id: compensationForm.employee_id,
        hourly_rate: Number(compensationForm.hourly_rate),
        currency_code: compensationForm.currency_code || 'USD',
        effective_from: compensationForm.effective_from,
        effective_to: compensationForm.effective_to || null,
      },
    ]).select('*').single();

    if (error) {
      queryClient.setQueryData(listKey, previous);
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'No se guardó la tarifa', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    queryClient.invalidateQueries({ queryKey: ['compensationRates'] });
    queryClient.invalidateQueries({ queryKey: ['monthlyPayroll'] });
    queryClient.invalidateQueries({ queryKey: ['orderLaborMargin'] });
    toast({ title: 'Tarifa agregada', description: 'La tarifa de compensación está activa.' });
    setCompDialogOpen(false);
    setCompensationForm({
      employee_id: '',
      hourly_rate: '',
      currency_code: 'USD',
      effective_from: '',
      effective_to: '',
    });
  };

  const handleLeaveRequestSave = async () => {
    setActionError(null);
    if (!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date) {
      setActionError('El empleado, la fecha de inicio y la fecha de término son obligatorios.');
      toast({
        variant: 'destructive',
        title: 'Faltan datos',
        description: 'El empleado, la fecha de inicio y la fecha de término son obligatorios.',
      });
      return;
    }

    const startDate = Date.parse(leaveForm.start_date);
    const endDate = Date.parse(leaveForm.end_date);
    if (Number.isNaN(startDate) || Number.isNaN(endDate)) {
      setActionError('Proporcione fechas de licencia válidas.');
      toast({ variant: 'destructive', title: 'Fechas inválidas', description: 'Proporcione fechas de licencia válidas.' });
      return;
    }
    if (endDate < startDate) {
      setActionError('La fecha de término de la licencia no puede ser anterior a la de inicio.');
      toast({
        variant: 'destructive',
        title: 'Rango de fechas inválido',
        description: 'La fecha de término de la licencia no puede ser anterior a la de inicio.',
      });
      return;
    }

    const listKey = ['hr', 'leaveRequests'];
    const previous = (queryClient.getQueryData(listKey) as any[]) || [];
    const optimisticId = `temp-${Date.now()}`;
    const optimisticRequest = {
      id: optimisticId,
      employee_id: leaveForm.employee_id,
      leave_type: leaveForm.leave_type,
      status: 'pending',
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      hours_requested: Number(leaveForm.hours_requested || 0),
    };
    queryClient.setQueryData(listKey, (current: any[] = []) => [optimisticRequest, ...current]);

    const { data, error } = await supabase.from('leave_requests').insert([
      {
        employee_id: leaveForm.employee_id,
        leave_type: leaveForm.leave_type as any,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        hours_requested: Number(leaveForm.hours_requested || 0),
        status: 'pending',
      },
    ]).select('*').single();

    if (error) {
      queryClient.setQueryData(listKey, previous);
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'No se pudo enviar la solicitud de licencia', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Solicitud de licencia enviada', description: 'En espera de aprobación.' });
    setLeaveDialogOpen(false);
    setLeaveForm({
      employee_id: '',
      leave_type: 'vacation',
      start_date: '',
      end_date: '',
      hours_requested: '',
    });
  };

  const updateLeaveStatus = async (requestId: string, status: string) => {
    setActionError(null);
    const listKey = ['hr', 'leaveRequests'];
    const previous = (queryClient.getQueryData(listKey) as any[]) || [];
    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === requestId ? { ...item, status } : item)),
    );
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: status as any })
      .eq('id', requestId);
    if (error) {
      queryClient.setQueryData(listKey, previous);
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'No se pudo actualizar la licencia', description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Estado de la licencia actualizado', description: `Solicitud marcada como ${status}.` });
  };

  const handleSkillAssign = async () => {
    setActionError(null);
    if (!skillForm.employee_id || !skillForm.skill_id) {
      setActionError('El empleado y la habilidad son obligatorios.');
      toast({
        variant: 'destructive',
        title: 'Faltan datos',
        description: 'El empleado y la habilidad son obligatorios.',
      });
      return;
    }

    const { data: existingSkill, error: existingSkillError } = await supabase
      .from('employee_skills')
      .select('id')
      .eq('employee_id', skillForm.employee_id)
      .eq('skill_id', skillForm.skill_id)
      .maybeSingle();

    if (existingSkillError) {
      setActionError(existingSkillError.message);
      toast({
        variant: 'destructive',
        title: 'Falló la verificación de la habilidad',
        description: existingSkillError.message,
      });
      return;
    }

    if (existingSkill) {
      setActionError('This employee already has that skill assigned.');
      toast({
        variant: 'destructive',
        title: 'Habilidad duplicada',
        description: 'Esa habilidad ya está asignada a este empleado.',
      });
      return;
    }

    const listKey = hrQueryKeys.employeeSkills(skillForm.employee_id);
    const previous = (queryClient.getQueryData(listKey) as any[]) || [];
    const optimisticId = `temp-${Date.now()}`;
    const optimisticSkill = {
      id: optimisticId,
      employee_id: skillForm.employee_id,
      skill_id: skillForm.skill_id,
      proficiency_level: Number(skillForm.proficiency_level),
      certified: skillForm.certified,
    };
    queryClient.setQueryData(listKey, (current: any[] = []) => [optimisticSkill, ...current]);

    const { data, error } = await supabase.from('employee_skills').insert([
      {
        employee_id: skillForm.employee_id,
        skill_id: skillForm.skill_id,
        proficiency_level: Number(skillForm.proficiency_level),
        certified: skillForm.certified,
      },
    ]).select('*').single();

    if (error) {
      queryClient.setQueryData(listKey, previous);
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'No se asignó la habilidad', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Habilidad asignada', description: 'Perfil de habilidades del empleado actualizado.' });
    setSkillDialogOpen(false);
    setSkillForm({
      employee_id: '',
      skill_id: '',
      proficiency_level: '1',
      certified: false,
    });
  };

  const handleIncentiveRuleSave = async () => {
    setActionError(null);
    if (!incentiveRuleForm.name || !incentiveRuleForm.amount) {
      setActionError('El nombre de la regla y el monto son obligatorios.');
      toast({
        variant: 'destructive',
        title: 'Faltan datos',
        description: 'El nombre de la regla y el monto son obligatorios.',
      });
      return;
    }

    if (Number(incentiveRuleForm.amount) <= 0) {
      setActionError('El monto del incentivo debe ser mayor que cero.');
      toast({
        variant: 'destructive',
        title: 'Monto inválido',
        description: 'El monto del incentivo debe ser mayor que cero.',
      });
      return;
    }

    const listKey = ['hr', 'incentiveRules'];
    const previous = (queryClient.getQueryData(listKey) as any[]) || [];
    const optimisticId = `temp-${Date.now()}`;
    const optimisticRule = {
      id: optimisticId,
      name: incentiveRuleForm.name,
      incentive_type: incentiveRuleForm.incentive_type,
      amount: Number(incentiveRuleForm.amount),
      currency_code: incentiveRuleForm.currency_code || 'USD',
      is_active: incentiveRuleForm.is_active,
    };
    queryClient.setQueryData(listKey, (current: any[] = []) => [optimisticRule, ...current]);

    const { data, error } = await supabase.from('incentive_rules').insert([
      {
        name: incentiveRuleForm.name,
        incentive_type: incentiveRuleForm.incentive_type as any,
        amount: Number(incentiveRuleForm.amount),
        currency_code: incentiveRuleForm.currency_code || 'USD',
        is_active: incentiveRuleForm.is_active,
      },
    ]).select('*').single();

    if (error) {
      queryClient.setQueryData(listKey, previous);
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'No se guardó la regla', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Regla creada', description: 'La regla de incentivo está lista.' });
    setIncentiveRuleDialogOpen(false);
    setIncentiveRuleForm({
      name: '',
      incentive_type: 'fixed_bonus',
      amount: '',
      currency_code: 'USD',
      is_active: true,
    });
  };

  const handleAwardSave = async () => {
    setActionError(null);
    if (!awardForm.employee_id || !awardForm.incentive_rule_id || !awardForm.amount) {
      setActionError('El empleado, la regla y el monto son obligatorios.');
      toast({
        variant: 'destructive',
        title: 'Faltan datos',
        description: 'El empleado, la regla y el monto son obligatorios.',
      });
      return;
    }

    if (Number(awardForm.amount) <= 0) {
      setActionError('El monto del otorgamiento debe ser mayor que cero.');
      toast({ variant: 'destructive', title: 'Monto inválido', description: 'El monto del otorgamiento debe ser mayor que cero.' });
      return;
    }

    const listKey = ['hr', 'employeeIncentives'];
    const previous = (queryClient.getQueryData(listKey) as any[]) || [];
    const optimisticId = `temp-${Date.now()}`;
    const optimisticAward = {
      id: optimisticId,
      employee_id: awardForm.employee_id,
      incentive_rule_id: awardForm.incentive_rule_id,
      amount: Number(awardForm.amount),
      awarded_date: awardForm.awarded_date || new Date().toISOString().split('T')[0],
      status: 'approved',
    };
    queryClient.setQueryData(listKey, (current: any[] = []) => [optimisticAward, ...current]);

    const { data, error } = await supabase.from('employee_incentives').insert([
      {
        employee_id: awardForm.employee_id,
        incentive_rule_id: awardForm.incentive_rule_id,
        amount: Number(awardForm.amount),
        awarded_date: awardForm.awarded_date || new Date().toISOString().split('T')[0],
        status: 'approved',
      },
    ]).select('*').single();

    if (error) {
      queryClient.setQueryData(listKey, previous);
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'Falló el otorgamiento', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Incentivo otorgado', description: 'El otorgamiento se ha registrado.' });
    setAwardDialogOpen(false);
    setAwardForm({
      employee_id: '',
      incentive_rule_id: '',
      amount: '',
      awarded_date: '',
    });
  };

  const handleDocumentSave = async () => {
    setActionError(null);
    if (!documentForm.employee_id || !documentForm.title) {
      setActionError('El empleado y el título son obligatorios.');
      toast({
        variant: 'destructive',
        title: 'Faltan datos',
        description: 'El empleado y el título son obligatorios.',
      });
      return;
    }

    if (documentForm.expires_on && documentForm.issue_date && documentForm.expires_on < documentForm.issue_date) {
      setActionError('La fecha de vencimiento no puede ser anterior a la de emisión.');
      toast({
        variant: 'destructive',
        title: 'Fechas inválidas',
        description: 'La fecha de vencimiento no puede ser anterior a la de emisión.',
      });
      return;
    }

    const { error } = await supabase.from('hr_documents').insert([
      {
        employee_id: documentForm.employee_id,
        title: documentForm.title,
        doc_type: documentForm.doc_type as any,
        issuer: documentForm.issuer || null,
        issue_date: documentForm.issue_date || null,
        expires_on: documentForm.expires_on || null,
        reminder_days_before: Number(documentForm.reminder_days_before || 0),
        file_url: documentForm.file_url || null,
        notes: documentForm.notes || null,
        status: 'active',
      },
    ]);

    if (error) {
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'No se guardó el documento', description: error.message });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['hr', 'documents'] });
    toast({ title: 'Documento guardado', description: 'Los metadatos ahora se registran.' });
    setDocumentDialogOpen(false);
    setDocumentForm({
      employee_id: '',
      title: '',
      doc_type: 'contract',
      issuer: '',
      issue_date: '',
      expires_on: '',
      reminder_days_before: '30',
      file_url: '',
      notes: '',
    });
  };

  const handleEmployeeDelete = async (employee: any) => {
    if (!employee?.id) return;

    const confirmed = window.confirm(
      `Delete employee profile for ${employee.full_name}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setActionError(null);
    const listKey = hrQueryKeys.employees();
    const previous = (queryClient.getQueryData(listKey) as any[]) || [];

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.filter((item) => item.id !== employee.id),
    );

    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', employee.id);

    if (error) {
      queryClient.setQueryData(listKey, previous);
      setActionError(error.message);
      toast({
        variant: 'destructive',
        title: 'No se eliminó el empleado',
        description: error.message,
      });
      return;
    }

    if (selectedEmployeeId === employee.id) {
      setSelectedEmployeeId(null);
      setSheetOpen(false);
    }

    queryClient.invalidateQueries({ queryKey: listKey });
    toast({
      title: 'Empleado eliminado',
      description: `${employee.full_name} profile has been removed.`,
    });
  };

  const handleRunAccrual = async () => {
    setActionError(null);
    setAccrualLoading(true);
    const targetDate = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.rpc('accrue_leave_balances', { target_date: targetDate });
    setAccrualLoading(false);

    if (error) {
      setActionError(error.message);
      toast({ variant: 'destructive', title: 'Falló la acumulación', description: error.message });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['hr', 'leaveBalances'] });
    toast({
      title: 'Acumulación completada',
      description: `Updated ${data ?? 0} leave balance records.`,
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Recursos Humanos</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestión de empleados y cumplimiento</p>
      </div>

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
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Perfiles de empleados</CardTitle>
                  {canManageHR && (
                    <Button
                      onClick={() => {
                        setActionError(null);
                        openEmployeeEditor(null);
                      }}
                      variant="outline"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Employee
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {employeesLoading && (
                  <p className="text-sm text-muted-foreground">Cargando perfiles de empleados...</p>
                )}
                {employeesError && (
                  <p className="text-sm text-destructive">No se pudieron cargar los perfiles de empleados.</p>
                )}
                {!employeesLoading && !employeesError && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="border-primary/10">
                        <CardHeader>
                          <CardTitle className="text-sm text-muted-foreground">Total de empleados</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-semibold text-primary">{employeeStats}</div>
                        </CardContent>
                      </Card>
                      <Card className="border-primary/10">
                        <CardHeader>
                          <CardTitle className="text-sm text-muted-foreground">Empleados activos</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-semibold text-primary">{activeEmployees}</div>
                        </CardContent>
                      </Card>
                      <Card className="border-primary/10">
                        <CardHeader>
                          <CardTitle className="text-sm text-muted-foreground">Departamentos</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-semibold text-primary">{departmentCount}</div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className="space-y-2">
                      {employees.slice(0, 8).map((employee: any) => (
                        <div
                          key={employee.id}
                          className="flex items-center justify-between rounded-lg border border-primary/10 bg-muted/40 px-4 py-3"
                        >
                          <div>
                            <p className="font-medium">{employee.full_name}</p>
                            <p className="text-xs text-muted-foreground">{employee.department || 'Unassigned'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {employee.status}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEmployeeDrawer(employee.id)}
                            >
                              View
                            </Button>
                            {canManageHR && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEmployeeEditor(employee)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEmployeeDelete(employee)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      {employees.length === 0 && (
                        <p className="text-sm text-muted-foreground">No se encontraron empleados.</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compensation">
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Compensación</CardTitle>
                  {canManageHR && (
                    <Button
                      onClick={() => {
                        setActionError(null);
                        setCompDialogOpen(true);
                      }}
                      variant="outline"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Rate
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Current compensation rates and historical changes.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Tarifas cargadas</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">{compensationRates.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Sin compensación</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">{compensationCoverage.missingComp}</div>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="space-y-2">
                    {compensationRates.slice(0, 8).map((rate: any) => (
                      <div
                        key={rate.id}
                        className="flex items-center justify-between rounded-lg border border-primary/10 bg-muted/40 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium">
                            {rate.currency_code} {rate.hourly_rate}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Effective {rate.effective_from} {rate.effective_to ? `to ${rate.effective_to}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{rate.employee_id?.slice(0, 8)}</span>
                      </div>
                    ))}
                    {compensationRates.length === 0 && (
                      <p className="text-sm text-muted-foreground">No se encontraron tarifas de compensación.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skills" className="space-y-4">
            <Tabs defaultValue="craft-paths" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="craft-paths">Rutas de oficios</TabsTrigger>
                <TabsTrigger value="tree">Árbol de habilidades</TabsTrigger>
                <TabsTrigger value="proficiency">Competencia del trabajador</TabsTrigger>
              </TabsList>

              <TabsContent value="craft-paths">
                <CraftSkillTree />
              </TabsContent>

              <TabsContent value="tree">
                <SkillTreeManager />
              </TabsContent>

              <TabsContent value="proficiency">
                <WorkerSkillsProficiency />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="leave">
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Licencias</CardTitle>
                  {canManageHR && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setActionError(null);
                          setLeaveDialogOpen(true);
                        }}
                        variant="outline"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New Request
                      </Button>
                      <Button onClick={handleRunAccrual} variant="outline" disabled={accrualLoading}>
                        {accrualLoading ? 'Running...' : 'Run Accrual'}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Saldos de licencia</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">{leaveBalances.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Solicitudes recientes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">{leaveRequests.length}</div>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="space-y-2">
                    {leaveRequests.slice(0, 8).map((request: any) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between rounded-lg border border-primary/10 bg-muted/40 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium">{request.leave_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.start_date} to {request.end_date} ({request.hours_requested}h)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {request.status}
                          </span>
                          {canManageHR && request.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateLeaveStatus(request.id, 'approved')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => updateLeaveStatus(request.id, 'rejected')}
                              >
                                Deny
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {leaveRequests.length === 0 && (
                      <p className="text-sm text-muted-foreground">No se encontraron solicitudes de licencia.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incentives">
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Incentivos</CardTitle>
                  {canManageHR && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setActionError(null);
                          setIncentiveRuleDialogOpen(true);
                        }}
                        variant="outline"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New Rule
                      </Button>
                      <Button
                        onClick={() => {
                          setActionError(null);
                          setAwardDialogOpen(true);
                        }}
                        variant="outline"
                      >
                        <Gift className="mr-2 h-4 w-4" />
                        Award
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Reglas activas</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">
                          {incentiveRules.filter((rule: any) => rule.is_active).length}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Otorgamientos recientes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">{incentiveAwards.length}</div>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="space-y-2">
                    {incentiveRules.slice(0, 8).map((rule: any) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between rounded-lg border border-primary/10 bg-muted/40 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-xs text-muted-foreground">{rule.incentive_type}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {rule.currency_code} {rule.amount}
                        </span>
                      </div>
                    ))}
                    {incentiveRules.length === 0 && (
                      <p className="text-sm text-muted-foreground">No se encontraron reglas de incentivo.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance">
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Cumplimiento</CardTitle>
                  {canManageHR && (
                    <Button
                      onClick={() => {
                        setActionError(null);
                        setDocumentDialogOpen(true);
                      }}
                      variant="outline"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Document
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-primary/10">
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Contratos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold text-primary">{employmentContracts.length}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/10">
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Sin contrato</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold text-primary">{compensationCoverage.missingContracts}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/10">
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Documentos por vencer</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold text-primary">{expiringDocuments.length}</div>
                    </CardContent>
                  </Card>
                </div>
                <div className="mt-6 space-y-2">
                  {expiringDocuments.slice(0, 6).map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border border-primary/10 bg-muted/40 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.doc_type} · {doc.employees?.full_name || 'Employee'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Expires {doc.expires_on || 'N/A'}
                      </span>
                    </div>
                  ))}
                  {expiringDocuments.length === 0 && (
                    <p className="text-sm text-muted-foreground">No hay documentos por vencer en los próximos 45 días.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>Detalles del empleado</SheetTitle>
              <SheetDescription>Resumen del perfil con contratos e historial.</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              {selectedEmployeeId ? (
                <>
                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Perfil</CardTitle>
                        {canManageHR && selectedEmployee && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEmployeeEditor(selectedEmployee)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEmployeeDelete(selectedEmployee)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedEmployee ? (
                        <>
                          <p className="text-sm font-medium">{selectedEmployee.full_name}</p>
                          <p className="text-xs text-muted-foreground">{selectedEmployee.department}</p>
                          <p className="text-xs text-muted-foreground">Estado: {selectedEmployee.status}</p>
                          {selectedEmployee.email && (
                            <p className="text-xs text-muted-foreground">Email: {selectedEmployee.email}</p>
                          )}
                          {selectedEmployee.phone && (
                            <p className="text-xs text-muted-foreground">Phone: {selectedEmployee.phone}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No hay empleado seleccionado.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <CardTitle className="text-base">Contratos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {employeeContracts.data?.slice(0, 3).map((contract: any) => (
                        <div key={contract.id} className="rounded-lg border border-primary/10 bg-muted/40 px-3 py-2">
                          <p className="text-sm font-medium">{contract.contract_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {contract.start_date} {contract.end_date ? `to ${contract.end_date}` : ''}
                          </p>
                        </div>
                      ))}
                      {employeeContracts.data?.length === 0 && (
                        <p className="text-sm text-muted-foreground">No se encontraron contratos.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Historial de compensación</CardTitle>
                        {canManageHR && selectedEmployeeId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openCompensationDialogFor(selectedEmployeeId)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {employeeCompHistory.data?.slice(0, 3).map((rate: any) => (
                        <div key={rate.id} className="rounded-lg border border-primary/10 bg-muted/40 px-3 py-2">
                          <p className="text-sm font-medium">
                            {rate.currency_code} {rate.hourly_rate}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {rate.effective_from} {rate.effective_to ? `to ${rate.effective_to}` : ''}
                          </p>
                        </div>
                      ))}
                      {employeeCompHistory.data?.length === 0 && (
                        <p className="text-sm text-muted-foreground">No se encontró historial de compensación.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Habilidades</CardTitle>
                        {canManageHR && selectedEmployeeId && (
                          <Button size="sm" variant="outline" onClick={() => openSkillDialogFor(selectedEmployeeId)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Assign
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {employeeSkills.slice(0, 4).map((skill: any) => (
                        <div key={skill.id} className="rounded-lg border border-primary/10 bg-muted/40 px-3 py-2">
                          <p className="text-sm font-medium">{skill.skills?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Level {skill.proficiency_level} {skill.certified ? '(Certified)' : ''}
                          </p>
                        </div>
                      ))}
                      {employeeSkills.length === 0 && (
                        <p className="text-sm text-muted-foreground">No hay habilidades asignadas.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Licencias</CardTitle>
                        {canManageHR && selectedEmployeeId && (
                          <Button size="sm" variant="outline" onClick={() => openLeaveDialogFor(selectedEmployeeId)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Request
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {employeeLeaveBalances.slice(0, 3).map((balance: any) => (
                        <div key={balance.id} className="rounded-lg border border-primary/10 bg-muted/40 px-3 py-2">
                          <p className="text-sm font-medium">{balance.leave_type}</p>
                          <p className="text-xs text-muted-foreground">
                            Balance {balance.balance_hours}h, Used {balance.used_hours}h
                          </p>
                        </div>
                      ))}
                      {employeeLeaveBalances.length === 0 && (
                        <p className="text-sm text-muted-foreground">No se encontraron saldos de licencia.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Solicitudes recientes</CardTitle>
                        {canManageHR && selectedEmployeeId && (
                          <Button size="sm" variant="outline" onClick={() => openLeaveDialogFor(selectedEmployeeId)}>
                            <Plus className="mr-2 h-4 w-4" />
                            New
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {employeeLeaveRequests.data?.slice(0, 3).map((request: any) => (
                        <div key={request.id} className="rounded-lg border border-primary/10 bg-muted/40 px-3 py-2">
                          <p className="text-sm font-medium">{request.leave_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.start_date} to {request.end_date}
                          </p>
                        </div>
                      ))}
                      {employeeLeaveRequests.data?.length === 0 && (
                        <p className="text-sm text-muted-foreground">No hay solicitudes recientes.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Incentivos</CardTitle>
                        {canManageHR && selectedEmployeeId && (
                          <Button size="sm" variant="outline" onClick={() => openAwardDialogFor(selectedEmployeeId)}>
                            <Gift className="mr-2 h-4 w-4" />
                            Award
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {incentiveAwards
                        .filter((award: any) => award.employee_id === selectedEmployeeId)
                        .slice(0, 3)
                        .map((award: any) => (
                          <div key={award.id} className="rounded-lg border border-primary/10 bg-muted/40 px-3 py-2">
                            <p className="text-sm font-medium">
                              {award.currency_code} {award.amount}
                            </p>
                            <p className="text-xs text-muted-foreground">{award.awarded_date}</p>
                          </div>
                        ))}
                      {incentiveAwards.filter((award: any) => award.employee_id === selectedEmployeeId).length === 0 && (
                        <p className="text-sm text-muted-foreground">No hay incentivos otorgados registrados.</p>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Seleccione un empleado para ver los detalles.</p>
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{employeeForm.id ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
              <DialogDescription>Actualizar la información principal del perfil.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="employee-name">Nombre completo</Label>
                <Input
                  id="employee-name"
                  value={employeeForm.full_name}
                  onChange={(event) => setEmployeeForm({ ...employeeForm, full_name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-department">Departamento</Label>
                <Input
                  id="employee-department"
                  value={employeeForm.department}
                  onChange={(event) => setEmployeeForm({ ...employeeForm, department: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employee-hire-date">Fecha de contratación</Label>
                  <Input
                    id="employee-hire-date"
                    type="date"
                    value={employeeForm.hire_date}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, hire_date: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-status">Estado</Label>
                  <select
                    id="employee-status"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={employeeForm.status}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, status: event.target.value })}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                    <option value="on_leave">En licencia</option>
                    <option value="terminated">Desvinculado</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employee-email">Correo electrónico</Label>
                  <Input
                    id="employee-email"
                    type="email"
                    value={employeeForm.email}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-phone">Teléfono</Label>
                  <Input
                    id="employee-phone"
                    value={employeeForm.phone}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, phone: event.target.value })}
                  />
                </div>
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmployeeDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEmployeeSave}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={compDialogOpen} onOpenChange={setCompDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar tarifa de compensación</DialogTitle>
              <DialogDescription>Crear una nueva tarifa con fechas de vigencia.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="comp-employee">Empleado</Label>
                <select
                  id="comp-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={compensationForm.employee_id}
                  onChange={(event) => setCompensationForm({ ...compensationForm, employee_id: event.target.value })}
                >
                  <option value="">Seleccionar empleado</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="comp-rate">Tarifa por hora</Label>
                  <Input
                    id="comp-rate"
                    type="number"
                    value={compensationForm.hourly_rate}
                    onChange={(event) => setCompensationForm({ ...compensationForm, hourly_rate: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comp-currency">Moneda</Label>
                  <Input
                    id="comp-currency"
                    value={compensationForm.currency_code}
                    onChange={(event) => setCompensationForm({ ...compensationForm, currency_code: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="comp-from">Vigente desde</Label>
                  <Input
                    id="comp-from"
                    type="date"
                    value={compensationForm.effective_from}
                    onChange={(event) => setCompensationForm({ ...compensationForm, effective_from: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comp-to">Vigente hasta</Label>
                  <Input
                    id="comp-to"
                    type="date"
                    value={compensationForm.effective_to}
                    onChange={(event) => setCompensationForm({ ...compensationForm, effective_to: event.target.value })}
                  />
                </div>
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCompensationSave}>Guardar tarifa</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva solicitud de licencia</DialogTitle>
              <DialogDescription>Crear una solicitud de licencia para un empleado.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="leave-employee">Empleado</Label>
                <select
                  id="leave-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={leaveForm.employee_id}
                  onChange={(event) => setLeaveForm({ ...leaveForm, employee_id: event.target.value })}
                >
                  <option value="">Seleccionar empleado</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-type">Tipo de licencia</Label>
                <select
                  id="leave-type"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={leaveForm.leave_type}
                  onChange={(event) => setLeaveForm({ ...leaveForm, leave_type: event.target.value })}
                >
                  <option value="vacation">Vacaciones</option>
                  <option value="sick">Enfermedad</option>
                  <option value="personal">Personal</option>
                  <option value="maternity">Maternidad</option>
                  <option value="paternity">Paternidad</option>
                  <option value="unpaid">Sin goce</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="leave-start">Fecha de inicio</Label>
                  <Input
                    id="leave-start"
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(event) => setLeaveForm({ ...leaveForm, start_date: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave-end">Fecha de término</Label>
                  <Input
                    id="leave-end"
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(event) => setLeaveForm({ ...leaveForm, end_date: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-hours">Horas solicitadas</Label>
                <Input
                  id="leave-hours"
                  type="number"
                  value={leaveForm.hours_requested}
                  onChange={(event) => setLeaveForm({ ...leaveForm, hours_requested: event.target.value })}
                />
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLeaveRequestSave}>Enviar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Asignar habilidad</DialogTitle>
              <DialogDescription>Agregar una habilidad al perfil de un empleado.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="skill-employee">Empleado</Label>
                <select
                  id="skill-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={skillForm.employee_id}
                  onChange={(event) => setSkillForm({ ...skillForm, employee_id: event.target.value })}
                >
                  <option value="">Seleccionar empleado</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-id">Habilidad</Label>
                <select
                  id="skill-id"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={skillForm.skill_id}
                  onChange={(event) => setSkillForm({ ...skillForm, skill_id: event.target.value })}
                  disabled={skillsLoading || Boolean(skillsError) || skills.length === 0}
                >
                  <option value="">
                    {skillsLoading
                      ? 'Loading skills...'
                      : skillsError
                        ? 'Unable to load skills'
                        : skills.length === 0
                          ? 'No skills available'
                          : 'Select skill'}
                  </option>
                  {skills.map((skill: any) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
                {skillsError && (
                  <p className="text-sm text-destructive">Could not load skills. Please refresh and try again.</p>
                )}
                {!skillsLoading && !skillsError && skills.length === 0 && (
                  <p className="text-sm text-muted-foreground">No se encontraron habilidades en la base de datos. Cargue habilidades primero y vuelva a abrir este diálogo.</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="skill-level">Nivel de competencia</Label>
                  <select
                    id="skill-level"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={skillForm.proficiency_level}
                    onChange={(event) => setSkillForm({ ...skillForm, proficiency_level: event.target.value })}
                  >
                    <option value="1">1 - Principiante</option>
                    <option value="2">2 - Básico</option>
                    <option value="3">3 - Competente</option>
                    <option value="4">4 - Avanzado</option>
                    <option value="5">5 - Experto</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="skill-certified"
                    type="checkbox"
                    checked={skillForm.certified}
                    onChange={(event) => setSkillForm({ ...skillForm, certified: event.target.checked })}
                  />
                  <Label htmlFor="skill-certified">Certificado</Label>
                </div>
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSkillDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSkillAssign} disabled={skillsLoading || Boolean(skillsError) || skills.length === 0}>
                Assign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={incentiveRuleDialogOpen} onOpenChange={setIncentiveRuleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear regla de incentivo</DialogTitle>
              <DialogDescription>Definir una nueva estructura de incentivos.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Nombre de la regla</Label>
                <Input
                  id="rule-name"
                  value={incentiveRuleForm.name}
                  onChange={(event) => setIncentiveRuleForm({ ...incentiveRuleForm, name: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rule-type">Tipo</Label>
                  <select
                    id="rule-type"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={incentiveRuleForm.incentive_type}
                    onChange={(event) => setIncentiveRuleForm({ ...incentiveRuleForm, incentive_type: event.target.value })}
                  >
                    <option value="fixed_bonus">Bono fijo</option>
                    <option value="performance_bonus">Bono por desempeño</option>
                    <option value="attendance_bonus">Bono por asistencia</option>
                    <option value="overtime_bonus">Bono por horas extra</option>
                    <option value="penalty_adjustment">Ajuste por penalización</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-amount">Monto</Label>
                  <Input
                    id="rule-amount"
                    type="number"
                    value={incentiveRuleForm.amount}
                    onChange={(event) => setIncentiveRuleForm({ ...incentiveRuleForm, amount: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rule-currency">Moneda</Label>
                  <Input
                    id="rule-currency"
                    value={incentiveRuleForm.currency_code}
                    onChange={(event) => setIncentiveRuleForm({ ...incentiveRuleForm, currency_code: event.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="rule-active"
                    type="checkbox"
                    checked={incentiveRuleForm.is_active}
                    onChange={(event) => setIncentiveRuleForm({ ...incentiveRuleForm, is_active: event.target.checked })}
                  />
                  <Label htmlFor="rule-active">Activo</Label>
                </div>
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIncentiveRuleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleIncentiveRuleSave}>Crear</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={awardDialogOpen} onOpenChange={setAwardDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Otorgar incentivo</DialogTitle>
              <DialogDescription>Otorgar un incentivo a un empleado.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="award-employee">Empleado</Label>
                <select
                  id="award-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={awardForm.employee_id}
                  onChange={(event) => setAwardForm({ ...awardForm, employee_id: event.target.value })}
                >
                  <option value="">Seleccionar empleado</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="award-rule">Regla</Label>
                <select
                  id="award-rule"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={awardForm.incentive_rule_id}
                  onChange={(event) => setAwardForm({ ...awardForm, incentive_rule_id: event.target.value })}
                >
                  <option value="">Seleccionar regla</option>
                  {incentiveRules.map((rule: any) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="award-amount">Monto</Label>
                  <Input
                    id="award-amount"
                    type="number"
                    value={awardForm.amount}
                    onChange={(event) => setAwardForm({ ...awardForm, amount: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="award-date">Fecha de otorgamiento</Label>
                  <Input
                    id="award-date"
                    type="date"
                    value={awardForm.awarded_date}
                    onChange={(event) => setAwardForm({ ...awardForm, awarded_date: event.target.value })}
                  />
                </div>
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAwardDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAwardSave}>Otorgar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar documento de RR.HH.</DialogTitle>
              <DialogDescription>Registrar metadatos de contratos y certificaciones.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="doc-employee">Empleado</Label>
                <select
                  id="doc-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={documentForm.employee_id}
                  onChange={(event) => setDocumentForm({ ...documentForm, employee_id: event.target.value })}
                >
                  <option value="">Seleccionar empleado</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-title">Título</Label>
                <Input
                  id="doc-title"
                  value={documentForm.title}
                  onChange={(event) => setDocumentForm({ ...documentForm, title: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doc-type">Tipo de documento</Label>
                  <select
                    id="doc-type"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={documentForm.doc_type}
                    onChange={(event) => setDocumentForm({ ...documentForm, doc_type: event.target.value })}
                  >
                    <option value="contract">Contrato</option>
                    <option value="certification">Certificación</option>
                    <option value="policy">Política</option>
                    <option value="training">Capacitación</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-issuer">Emisor</Label>
                  <Input
                    id="doc-issuer"
                    value={documentForm.issuer}
                    onChange={(event) => setDocumentForm({ ...documentForm, issuer: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doc-issue-date">Fecha de emisión</Label>
                  <Input
                    id="doc-issue-date"
                    type="date"
                    value={documentForm.issue_date}
                    onChange={(event) => setDocumentForm({ ...documentForm, issue_date: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-expiry-date">Fecha de vencimiento</Label>
                  <Input
                    id="doc-expiry-date"
                    type="date"
                    value={documentForm.expires_on}
                    onChange={(event) => setDocumentForm({ ...documentForm, expires_on: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doc-reminder">Días de aviso previo</Label>
                  <Input
                    id="doc-reminder"
                    type="number"
                    value={documentForm.reminder_days_before}
                    onChange={(event) =>
                      setDocumentForm({ ...documentForm, reminder_days_before: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-file">URL del archivo</Label>
                  <Input
                    id="doc-file"
                    value={documentForm.file_url}
                    onChange={(event) => setDocumentForm({ ...documentForm, file_url: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-notes">Notas</Label>
                <Input
                  id="doc-notes"
                  value={documentForm.notes}
                  onChange={(event) => setDocumentForm({ ...documentForm, notes: event.target.value })}
                />
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDocumentDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleDocumentSave}>Guardar documento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
};

export default HrManagerDashboard;
