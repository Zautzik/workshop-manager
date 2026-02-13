/**
 * @fileoverview Language/Localization Context — thin wrapper over i18next
 *
 * Provides backward-compatible useLanguage().t('flatKey') API while delegating
 * to the real i18next instance. New code should prefer useTranslation() from
 * react-i18next directly with namespaced keys (e.g. t('auth.login')).
 */
'use client';

import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n/config';

type Language = 'en' | 'es';

/** Maps legacy flat keys → namespaced i18next keys */
const keyMap: Record<string, string> = {
  // Auth
  login: 'auth.login',
  email: 'auth.email',
  password: 'auth.password',
  logout: 'auth.logout',

  // Dashboards
  supervisorDashboard: 'dashboard.supervisor',
  managerDashboard: 'dashboard.manager',
  adminDashboard: 'dashboard.admin',
  totalUsers: 'dashboard.totalUsers',
  totalWorkers: 'dashboard.totalWorkers',
  totalJobs: 'dashboard.totalJobs',

  // Navigation
  machines: 'nav.machines',
  jobs: 'nav.jobs',
  reports: 'nav.reports',
  users: 'nav.users',
  workers: 'nav.workers',
  inventory: 'nav.inventory',
  purchases: 'nav.purchases',

  // User management
  userManagement: 'userMgmt.title',
  addUser: 'userMgmt.addUser',
  editUser: 'userMgmt.editUser',
  role: 'userMgmt.role',
  department: 'userMgmt.department',
  managerDomain: 'userMgmt.managerDomain',
  addUserDescription: 'userMgmt.addDescription',
  editUserDescription: 'userMgmt.editDescription',

  // Worker management
  workersManagement: 'workerMgmt.title',
  addWorker: 'workerMgmt.addWorker',
  editWorker: 'workerMgmt.editWorker',
  addWorkerDescription: 'workerMgmt.addDescription',
  editWorkerDescription: 'workerMgmt.editDescription',
  workerRoster: 'workerMgmt.roster',
  createRoster: 'workerMgmt.createRoster',
  rosterName: 'workerMgmt.rosterName',
  addToRoster: 'workerMgmt.addToRoster',
  removeFromRoster: 'workerMgmt.removeFromRoster',
  allWorkers: 'workerMgmt.allWorkers',
  filterByDept: 'workerMgmt.filterByDept',
  sortBy: 'workerMgmt.sortBy',
  workerStats: 'workerMgmt.stats',
  viewStats: 'workerMgmt.viewStats',
  performance: 'workerMgmt.performance',
  avgTime: 'workerMgmt.avgTime',
  rating: 'workerMgmt.rating',
  efficiencyScore: 'workerMgmt.efficiencyScore',
  totalTasks: 'workerMgmt.totalTasks',
  logTask: 'workerMgmt.logTask',
  taskType: 'workerMgmt.taskType',
  timeSpent: 'workerMgmt.timeSpent',
  notes: 'workerMgmt.notes',

  // Inventory management
  inventoryManagement: 'inventoryMgmt.title',
  addItem: 'inventoryMgmt.addItem',
  editItem: 'inventoryMgmt.editItem',
  itemName: 'inventoryMgmt.itemName',
  quantity: 'inventoryMgmt.quantity',
  costPerUnit: 'inventoryMgmt.costPerUnit',
  supplier: 'inventoryMgmt.supplier',
  totalCost: 'inventoryMgmt.totalCost',
  certificationDetails: 'inventoryMgmt.certificationDetails',
  addItemDescription: 'inventoryMgmt.addDescription',
  editItemDescription: 'inventoryMgmt.editDescription',

  // Purchases management
  purchasesManagement: 'purchasesMgmt.title',
  addPurchase: 'purchasesMgmt.addPurchase',
  editPurchase: 'purchasesMgmt.editPurchase',
  addPurchaseDescription: 'purchasesMgmt.addDescription',
  editPurchaseDescription: 'purchasesMgmt.editDescription',

  // Roles
  admin: 'roles.admin',
  manager: 'roles.manager',
  supervisor: 'roles.supervisor',

  // Departments
  press: 'departments.press',
  deliveries: 'departments.deliveries',
  administration: 'departments.administration',
  pre_press: 'departments.pre_press',
  manual_workshop: 'departments.manual_workshop',

  // Manager domains
  cost: 'domains.cost',
  production: 'domains.production',
  quality: 'domains.quality',

  // Machine statuses
  idle: 'machineStatus.idle',
  running: 'machineStatus.running',
  maintenance: 'machineStatus.maintenance',
  offline: 'machineStatus.offline',

  // Job statuses
  pending: 'jobStatus.pending',
  in_progress: 'jobStatus.in_progress',
  completed: 'jobStatus.completed',
  delivered: 'jobStatus.delivered',

  // Machine types
  offset_printer: 'machineTypes.offset_printer',
  die_cutter: 'machineTypes.die_cutter',
  guillotine: 'machineTypes.guillotine',
  digital_printer: 'machineTypes.digital_printer',

  // Actions
  addJob: 'actions.addJob',
  updateStatus: 'actions.updateStatus',
  addOT: 'actions.addOT',
  addBatch: 'actions.addBatch',
  viewTraceability: 'actions.viewTraceability',
  exportPDF: 'actions.exportPDF',
  assignWorker: 'actions.assignWorker',
  assignBatch: 'actions.assignBatch',

  // OT
  ot: 'ot.title',
  otNumber: 'ot.otNumber',
  otList: 'ot.list',
  createOT: 'ot.create',

  // Batches
  batch: 'batch.title',
  batches: 'batch.batches',
  batchNumber: 'batch.number',
  paperType: 'batch.paperType',
  quantityRemaining: 'batch.quantityRemaining',
  certifications: 'batch.certifications',

  // Costs
  totalJobCost: 'costs.totalJobCost',
  materialCost: 'costs.materialCost',
  laborCost: 'costs.laborCost',
  machineCost: 'costs.machineCost',
  costBreakdown: 'costs.breakdown',

  // Reports
  costReport: 'reports.cost',
  efficiencyReport: 'reports.efficiency',
  traceabilityReport: 'reports.traceability',

  // Stats
  completedJobs: 'stats.completedJobs',
  pendingJobs: 'stats.pendingJobs',
  efficiency: 'stats.efficiency',
  totalOTs: 'stats.totalOTs',
  jobsPerDay: 'stats.jobsPerDay',

  // Process
  processFlow: 'process.flow',
  timeline: 'process.timeline',

  // Tasks
  detachment: 'tasks.detachment',
  revision: 'tasks.revision',
  packaging: 'tasks.packaging',
  printing: 'tasks.printing',
  cutting: 'tasks.cutting',

  // Common
  name: 'common.name',
  actions: 'common.actions',
  date: 'common.date',
  description: 'common.description',
  status: 'common.status',
  submit: 'common.submit',
  cancel: 'common.cancel',
  save: 'common.save',
  edit: 'common.edit',
  delete: 'common.delete',
  view: 'common.view',
  overview: 'common.overview',
  noData: 'common.noData',
  search: 'common.search',
  createdAt: 'common.createdAt',
  confirmDelete: 'common.confirmDelete',
  create: 'common.create',
  update: 'common.update',

  // Singular nouns (used in some components)
  machine: 'nav.machines',
  worker: 'nav.workers',
  delivery: 'departments.deliveries',
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t: i18nT } = useTranslation();

  const language = (i18n.language?.startsWith('es') ? 'es' : 'en') as Language;

  const setLanguage = useCallback((lang: Language) => {
    i18n.changeLanguage(lang);
  }, []);

  const t = useCallback(
    (key: string): string => {
      // Try the key mapped to its namespace first, then as-is (for new code)
      const mapped = keyMap[key];
      if (mapped) return i18nT(mapped);
      // Try directly (supports namespaced keys like 'auth.login')
      const result = i18nT(key);
      if (result !== key) return result;
      // Fallback: return the key itself
      return key;
    },
    [i18nT],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
