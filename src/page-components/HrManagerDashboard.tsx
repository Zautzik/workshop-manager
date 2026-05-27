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
      setActionError('Full name, department, and hire date are required.');
      toast({
        variant: 'destructive',
        title: 'Missing details',
        description: 'Full name, department, and hire date are required.',
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
      toast({ variant: 'destructive', title: 'Employee update failed', description: error.message });
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
    toast({ title: 'Employee saved', description: `${data.full_name} is up to date.` });
    setEmployeeDialogOpen(false);
    resetEmployeeForm();
  };

  const handleCompensationSave = async () => {
    setActionError(null);
    if (!compensationForm.employee_id || !compensationForm.hourly_rate || !compensationForm.effective_from) {
      setActionError('Employee, hourly rate, and effective date are required.');
      toast({
        variant: 'destructive',
        title: 'Missing details',
        description: 'Employee, hourly rate, and effective date are required.',
      });
      return;
    }

    const effectiveFrom = Date.parse(compensationForm.effective_from);
    const effectiveTo = compensationForm.effective_to
      ? Date.parse(compensationForm.effective_to)
      : null;

    if (Number.isNaN(effectiveFrom) || (compensationForm.effective_to && Number.isNaN(effectiveTo))) {
      setActionError('Provide valid dates for compensation.');
      toast({ variant: 'destructive', title: 'Invalid dates', description: 'Provide valid dates.' });
      return;
    }

    if (effectiveTo !== null && effectiveTo < effectiveFrom) {
      setActionError('Effective end date cannot be before start date.');
      toast({
        variant: 'destructive',
        title: 'Invalid date range',
        description: 'Effective end date cannot be before start date.',
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
        title: 'Overlapping rate',
        description: 'Adjust the effective dates to avoid overlap.',
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
      toast({ variant: 'destructive', title: 'Rate not saved', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    queryClient.invalidateQueries({ queryKey: ['compensationRates'] });
    queryClient.invalidateQueries({ queryKey: ['monthlyPayroll'] });
    queryClient.invalidateQueries({ queryKey: ['orderLaborMargin'] });
    toast({ title: 'Rate added', description: 'Compensation rate is live.' });
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
      setActionError('Employee, start date, and end date are required.');
      toast({
        variant: 'destructive',
        title: 'Missing details',
        description: 'Employee, start date, and end date are required.',
      });
      return;
    }

    const startDate = Date.parse(leaveForm.start_date);
    const endDate = Date.parse(leaveForm.end_date);
    if (Number.isNaN(startDate) || Number.isNaN(endDate)) {
      setActionError('Provide valid leave dates.');
      toast({ variant: 'destructive', title: 'Invalid dates', description: 'Provide valid leave dates.' });
      return;
    }
    if (endDate < startDate) {
      setActionError('Leave end date cannot be before start date.');
      toast({
        variant: 'destructive',
        title: 'Invalid date range',
        description: 'Leave end date cannot be before start date.',
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
      toast({ variant: 'destructive', title: 'Leave request failed', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Leave request sent', description: 'Awaiting approval.' });
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
      toast({ variant: 'destructive', title: 'Leave update failed', description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Leave status updated', description: `Request marked ${status}.` });
  };

  const handleSkillAssign = async () => {
    setActionError(null);
    if (!skillForm.employee_id || !skillForm.skill_id) {
      setActionError('Employee and skill are required.');
      toast({
        variant: 'destructive',
        title: 'Missing details',
        description: 'Employee and skill are required.',
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
        title: 'Skill check failed',
        description: existingSkillError.message,
      });
      return;
    }

    if (existingSkill) {
      setActionError('This employee already has that skill assigned.');
      toast({
        variant: 'destructive',
        title: 'Duplicate skill',
        description: 'That skill is already assigned to this employee.',
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
      toast({ variant: 'destructive', title: 'Skill not assigned', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Skill assigned', description: 'Employee skill profile updated.' });
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
      setActionError('Rule name and amount are required.');
      toast({
        variant: 'destructive',
        title: 'Missing details',
        description: 'Rule name and amount are required.',
      });
      return;
    }

    if (Number(incentiveRuleForm.amount) <= 0) {
      setActionError('Incentive amount must be greater than zero.');
      toast({
        variant: 'destructive',
        title: 'Invalid amount',
        description: 'Incentive amount must be greater than zero.',
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
      toast({ variant: 'destructive', title: 'Rule not saved', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Rule created', description: 'Incentive rule is ready.' });
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
      setActionError('Employee, rule, and amount are required.');
      toast({
        variant: 'destructive',
        title: 'Missing details',
        description: 'Employee, rule, and amount are required.',
      });
      return;
    }

    if (Number(awardForm.amount) <= 0) {
      setActionError('Award amount must be greater than zero.');
      toast({ variant: 'destructive', title: 'Invalid amount', description: 'Award amount must be greater than zero.' });
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
      toast({ variant: 'destructive', title: 'Award failed', description: error.message });
      return;
    }

    queryClient.setQueryData(listKey, (current: any[] = []) =>
      current.map((item) => (item.id === optimisticId ? data : item)),
    );
    queryClient.invalidateQueries({ queryKey: listKey });
    toast({ title: 'Incentive awarded', description: 'Award has been recorded.' });
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
      setActionError('Employee and title are required.');
      toast({
        variant: 'destructive',
        title: 'Missing details',
        description: 'Employee and title are required.',
      });
      return;
    }

    if (documentForm.expires_on && documentForm.issue_date && documentForm.expires_on < documentForm.issue_date) {
      setActionError('Expiry date cannot be before issue date.');
      toast({
        variant: 'destructive',
        title: 'Invalid dates',
        description: 'Expiry date cannot be before issue date.',
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
      toast({ variant: 'destructive', title: 'Document not saved', description: error.message });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['hr', 'documents'] });
    toast({ title: 'Document saved', description: 'Metadata is now tracked.' });
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
        title: 'Employee not deleted',
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
      title: 'Employee deleted',
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
      toast({ variant: 'destructive', title: 'Accrual failed', description: error.message });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['hr', 'leaveBalances'] });
    toast({
      title: 'Accrual complete',
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
                  <CardTitle>Employee Profiles</CardTitle>
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
                  <p className="text-sm text-muted-foreground">Loading employee profiles...</p>
                )}
                {employeesError && (
                  <p className="text-sm text-destructive">Failed to load employee profiles.</p>
                )}
                {!employeesLoading && !employeesError && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="border-primary/10">
                        <CardHeader>
                          <CardTitle className="text-sm text-muted-foreground">Total Employees</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-semibold text-primary">{employeeStats}</div>
                        </CardContent>
                      </Card>
                      <Card className="border-primary/10">
                        <CardHeader>
                          <CardTitle className="text-sm text-muted-foreground">Active Employees</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-semibold text-primary">{activeEmployees}</div>
                        </CardContent>
                      </Card>
                      <Card className="border-primary/10">
                        <CardHeader>
                          <CardTitle className="text-sm text-muted-foreground">Departments</CardTitle>
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
                        <p className="text-sm text-muted-foreground">No employees found.</p>
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
                  <CardTitle>Compensation</CardTitle>
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
                        <CardTitle className="text-sm text-muted-foreground">Rates Loaded</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">{compensationRates.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Missing Compensation</CardTitle>
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
                      <p className="text-sm text-muted-foreground">No compensation rates found.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skills" className="space-y-4">
            <Tabs defaultValue="craft-paths" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="craft-paths">Craft Skill Paths</TabsTrigger>
                <TabsTrigger value="tree">Skill Tech Tree</TabsTrigger>
                <TabsTrigger value="proficiency">Worker Proficiency</TabsTrigger>
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
                  <CardTitle>Leave</CardTitle>
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
                        <CardTitle className="text-sm text-muted-foreground">Leave Balances</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">{leaveBalances.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Recent Requests</CardTitle>
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
                      <p className="text-sm text-muted-foreground">No leave requests found.</p>
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
                  <CardTitle>Incentives</CardTitle>
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
                        <CardTitle className="text-sm text-muted-foreground">Active Rules</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold text-primary">
                          {incentiveRules.filter((rule: any) => rule.is_active).length}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Recent Awards</CardTitle>
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
                      <p className="text-sm text-muted-foreground">No incentive rules found.</p>
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
                  <CardTitle>Compliance</CardTitle>
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
                      <CardTitle className="text-sm text-muted-foreground">Contracts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold text-primary">{employmentContracts.length}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/10">
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Missing Contracts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold text-primary">{compensationCoverage.missingContracts}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/10">
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Expiring Documents</CardTitle>
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
                    <p className="text-sm text-muted-foreground">No expiring documents in the next 45 days.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>Employee Details</SheetTitle>
              <SheetDescription>Profile snapshot with contracts and history.</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              {selectedEmployeeId ? (
                <>
                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Profile</CardTitle>
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
                          <p className="text-xs text-muted-foreground">Status: {selectedEmployee.status}</p>
                          {selectedEmployee.email && (
                            <p className="text-xs text-muted-foreground">Email: {selectedEmployee.email}</p>
                          )}
                          {selectedEmployee.phone && (
                            <p className="text-xs text-muted-foreground">Phone: {selectedEmployee.phone}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No employee selected.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <CardTitle className="text-base">Contracts</CardTitle>
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
                        <p className="text-sm text-muted-foreground">No contracts found.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Compensation History</CardTitle>
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
                        <p className="text-sm text-muted-foreground">No compensation history found.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Skills</CardTitle>
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
                        <p className="text-sm text-muted-foreground">No skills assigned.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Leave</CardTitle>
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
                        <p className="text-sm text-muted-foreground">No leave balances found.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Recent Requests</CardTitle>
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
                        <p className="text-sm text-muted-foreground">No recent requests.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Incentives</CardTitle>
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
                        <p className="text-sm text-muted-foreground">No incentive awards recorded.</p>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select an employee to view details.</p>
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{employeeForm.id ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
              <DialogDescription>Update core profile information.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="employee-name">Full name</Label>
                <Input
                  id="employee-name"
                  value={employeeForm.full_name}
                  onChange={(event) => setEmployeeForm({ ...employeeForm, full_name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-department">Department</Label>
                <Input
                  id="employee-department"
                  value={employeeForm.department}
                  onChange={(event) => setEmployeeForm({ ...employeeForm, department: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employee-hire-date">Hire date</Label>
                  <Input
                    id="employee-hire-date"
                    type="date"
                    value={employeeForm.hire_date}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, hire_date: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-status">Status</Label>
                  <select
                    id="employee-status"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={employeeForm.status}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, status: event.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On leave</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employee-email">Email</Label>
                  <Input
                    id="employee-email"
                    type="email"
                    value={employeeForm.email}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-phone">Phone</Label>
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
              <Button onClick={handleEmployeeSave}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={compDialogOpen} onOpenChange={setCompDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Compensation Rate</DialogTitle>
              <DialogDescription>Create a new rate with effective dates.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="comp-employee">Employee</Label>
                <select
                  id="comp-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={compensationForm.employee_id}
                  onChange={(event) => setCompensationForm({ ...compensationForm, employee_id: event.target.value })}
                >
                  <option value="">Select employee</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="comp-rate">Hourly rate</Label>
                  <Input
                    id="comp-rate"
                    type="number"
                    value={compensationForm.hourly_rate}
                    onChange={(event) => setCompensationForm({ ...compensationForm, hourly_rate: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comp-currency">Currency</Label>
                  <Input
                    id="comp-currency"
                    value={compensationForm.currency_code}
                    onChange={(event) => setCompensationForm({ ...compensationForm, currency_code: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="comp-from">Effective from</Label>
                  <Input
                    id="comp-from"
                    type="date"
                    value={compensationForm.effective_from}
                    onChange={(event) => setCompensationForm({ ...compensationForm, effective_from: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comp-to">Effective to</Label>
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
              <Button onClick={handleCompensationSave}>Save Rate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Leave Request</DialogTitle>
              <DialogDescription>Create a leave request for an employee.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="leave-employee">Employee</Label>
                <select
                  id="leave-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={leaveForm.employee_id}
                  onChange={(event) => setLeaveForm({ ...leaveForm, employee_id: event.target.value })}
                >
                  <option value="">Select employee</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-type">Leave type</Label>
                <select
                  id="leave-type"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={leaveForm.leave_type}
                  onChange={(event) => setLeaveForm({ ...leaveForm, leave_type: event.target.value })}
                >
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick</option>
                  <option value="personal">Personal</option>
                  <option value="maternity">Maternity</option>
                  <option value="paternity">Paternity</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="leave-start">Start date</Label>
                  <Input
                    id="leave-start"
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(event) => setLeaveForm({ ...leaveForm, start_date: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave-end">End date</Label>
                  <Input
                    id="leave-end"
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(event) => setLeaveForm({ ...leaveForm, end_date: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-hours">Hours requested</Label>
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
              <Button onClick={handleLeaveRequestSave}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Skill</DialogTitle>
              <DialogDescription>Add a skill to an employee profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="skill-employee">Employee</Label>
                <select
                  id="skill-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={skillForm.employee_id}
                  onChange={(event) => setSkillForm({ ...skillForm, employee_id: event.target.value })}
                >
                  <option value="">Select employee</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-id">Skill</Label>
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
                  <p className="text-sm text-muted-foreground">No skills found in the database. Seed skills first, then reopen this dialog.</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="skill-level">Proficiency level</Label>
                  <select
                    id="skill-level"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={skillForm.proficiency_level}
                    onChange={(event) => setSkillForm({ ...skillForm, proficiency_level: event.target.value })}
                  >
                    <option value="1">1 - Beginner</option>
                    <option value="2">2 - Basic</option>
                    <option value="3">3 - Skilled</option>
                    <option value="4">4 - Advanced</option>
                    <option value="5">5 - Expert</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="skill-certified"
                    type="checkbox"
                    checked={skillForm.certified}
                    onChange={(event) => setSkillForm({ ...skillForm, certified: event.target.checked })}
                  />
                  <Label htmlFor="skill-certified">Certified</Label>
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
              <DialogTitle>Create Incentive Rule</DialogTitle>
              <DialogDescription>Define a new incentive structure.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Rule name</Label>
                <Input
                  id="rule-name"
                  value={incentiveRuleForm.name}
                  onChange={(event) => setIncentiveRuleForm({ ...incentiveRuleForm, name: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rule-type">Type</Label>
                  <select
                    id="rule-type"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={incentiveRuleForm.incentive_type}
                    onChange={(event) => setIncentiveRuleForm({ ...incentiveRuleForm, incentive_type: event.target.value })}
                  >
                    <option value="fixed_bonus">Fixed bonus</option>
                    <option value="performance_bonus">Performance bonus</option>
                    <option value="attendance_bonus">Attendance bonus</option>
                    <option value="overtime_bonus">Overtime bonus</option>
                    <option value="penalty_adjustment">Penalty adjustment</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-amount">Amount</Label>
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
                  <Label htmlFor="rule-currency">Currency</Label>
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
                  <Label htmlFor="rule-active">Active</Label>
                </div>
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIncentiveRuleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleIncentiveRuleSave}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={awardDialogOpen} onOpenChange={setAwardDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Award Incentive</DialogTitle>
              <DialogDescription>Grant an incentive to an employee.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="award-employee">Employee</Label>
                <select
                  id="award-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={awardForm.employee_id}
                  onChange={(event) => setAwardForm({ ...awardForm, employee_id: event.target.value })}
                >
                  <option value="">Select employee</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="award-rule">Rule</Label>
                <select
                  id="award-rule"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={awardForm.incentive_rule_id}
                  onChange={(event) => setAwardForm({ ...awardForm, incentive_rule_id: event.target.value })}
                >
                  <option value="">Select rule</option>
                  {incentiveRules.map((rule: any) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="award-amount">Amount</Label>
                  <Input
                    id="award-amount"
                    type="number"
                    value={awardForm.amount}
                    onChange={(event) => setAwardForm({ ...awardForm, amount: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="award-date">Awarded date</Label>
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
              <Button onClick={handleAwardSave}>Award</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add HR Document</DialogTitle>
              <DialogDescription>Track contract and certification metadata.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="doc-employee">Employee</Label>
                <select
                  id="doc-employee"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={documentForm.employee_id}
                  onChange={(event) => setDocumentForm({ ...documentForm, employee_id: event.target.value })}
                >
                  <option value="">Select employee</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-title">Title</Label>
                <Input
                  id="doc-title"
                  value={documentForm.title}
                  onChange={(event) => setDocumentForm({ ...documentForm, title: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doc-type">Document type</Label>
                  <select
                    id="doc-type"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={documentForm.doc_type}
                    onChange={(event) => setDocumentForm({ ...documentForm, doc_type: event.target.value })}
                  >
                    <option value="contract">Contract</option>
                    <option value="certification">Certification</option>
                    <option value="policy">Policy</option>
                    <option value="training">Training</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-issuer">Issuer</Label>
                  <Input
                    id="doc-issuer"
                    value={documentForm.issuer}
                    onChange={(event) => setDocumentForm({ ...documentForm, issuer: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doc-issue-date">Issue date</Label>
                  <Input
                    id="doc-issue-date"
                    type="date"
                    value={documentForm.issue_date}
                    onChange={(event) => setDocumentForm({ ...documentForm, issue_date: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-expiry-date">Expiry date</Label>
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
                  <Label htmlFor="doc-reminder">Reminder days before</Label>
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
                  <Label htmlFor="doc-file">File URL</Label>
                  <Input
                    id="doc-file"
                    value={documentForm.file_url}
                    onChange={(event) => setDocumentForm({ ...documentForm, file_url: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-notes">Notes</Label>
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
              <Button onClick={handleDocumentSave}>Save Document</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
};

export default HrManagerDashboard;
