/**
 * @fileoverview Language/Localization Context (i18n)
 * 
 * SYSTEM ROLE: Multi-Language Support Manager
 * ORGAN ANALOGY: The "Translation Department" - Provides localized text in English & Spanish
 * 
 * This context manages application internationalization (i18n):
 * - Stores all UI text translations in English (en) and Spanish (es)
 * - Provides setLanguage() to switch between languages
 * - Provides t() translation function to retrieve localized text
 * - Covers all UI text: buttons, labels, dashboard titles, status texts, etc.
 * 
 * Usage: const { t } = useLanguage(); then t('login') returns "Login" or "Iniciar sesión"
 * 
 * Supports entire application with 300+ translation keys for both languages.
 */
'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'es';

interface Translations {
	[key: string]: {
		en: string;
		es: string;
	};
}

const translations: Translations = {
	// Auth
	login: { en: 'Login', es: 'Iniciar sesión' },
	email: { en: 'Email', es: 'Correo electrónico' },
	password: { en: 'Password', es: 'Contraseña' },
	logout: { en: 'Logout', es: 'Cerrar sesión' },

	// Dashboards
	supervisorDashboard: {
		en: 'Supervisor Dashboard',
		es: 'Panel de Supervisor',
	},
	managerDashboard: { en: 'Manager Dashboard', es: 'Panel de Gerente' },
	adminDashboard: { en: 'Admin Dashboard', es: 'Panel de Administrador' },
	machines: { en: 'Machines', es: 'Máquinas' },
	jobs: { en: 'Jobs', es: 'Trabajos' },
	reports: { en: 'Reports', es: 'Reportes' },
	users: { en: 'Users', es: 'Usuarios' },
	workers: { en: 'Workers', es: 'Trabajadores' },
	inventory: { en: 'Inventory', es: 'Inventario' },
	purchases: { en: 'Purchases', es: 'Compras' },
	totalUsers: { en: 'Total Users', es: 'Total de Usuarios' },
	totalWorkers: { en: 'Total Workers', es: 'Total de Trabajadores' },
	userManagement: { en: 'User Management', es: 'Gestión de Usuarios' },
	workersManagement: {
		en: 'Workers Management',
		es: 'Gestión de Trabajadores',
	},
	inventoryManagement: {
		en: 'Inventory Management',
		es: 'Gestión de Inventario',
	},
	purchasesManagement: { en: 'Purchases Management', es: 'Gestión de Compras' },
	addUser: { en: 'Add User', es: 'Agregar Usuario' },
	addWorker: { en: 'Add Worker', es: 'Agregar Trabajador' },
	addItem: { en: 'Add Item', es: 'Agregar Artículo' },
	addPurchase: { en: 'Add Purchase', es: 'Agregar Compra' },
	editUser: { en: 'Edit User', es: 'Editar Usuario' },
	editWorker: { en: 'Edit Worker', es: 'Editar Trabajador' },
	editItem: { en: 'Edit Item', es: 'Editar Artículo' },
	editPurchase: { en: 'Edit Purchase', es: 'Editar Compra' },
	role: { en: 'Role', es: 'Rol' },
	department: { en: 'Department', es: 'Departamento' },
	name: { en: 'Name', es: 'Nombre' },
	actions: { en: 'Actions', es: 'Acciones' },
	itemName: { en: 'Item Name', es: 'Nombre del Artículo' },
	quantity: { en: 'Quantity', es: 'Cantidad' },
	costPerUnit: { en: 'Cost per Unit', es: 'Costo por Unidad' },
	supplier: { en: 'Supplier', es: 'Proveedor' },
	date: { en: 'Date', es: 'Fecha' },
	totalCost: { en: 'Total Cost', es: 'Costo Total' },
	certificationDetails: {
		en: 'Certification Details',
		es: 'Detalles de Certificación',
	},
	confirmDelete: {
		en: 'Are you sure you want to delete this?',
		es: '¿Estás seguro de que deseas eliminar esto?',
	},
	create: { en: 'Create', es: 'Crear' },
	update: { en: 'Update', es: 'Actualizar' },
	admin: { en: 'Admin', es: 'Administrador' },
	manager: { en: 'Manager', es: 'Gerente' },
	supervisor: { en: 'Supervisor', es: 'Supervisor' },
	press: { en: 'Press', es: 'Prensa' },
	deliveries: { en: 'Deliveries', es: 'Entregas' },
	administration: { en: 'Administration', es: 'Administración' },
	managerDomain: { en: 'Manager Domain', es: 'Dominio del Gerente' },
	cost: { en: 'Cost', es: 'Costos' },
	production: { en: 'Production', es: 'Producción' },
	quality: { en: 'Quality', es: 'Calidad' },
	addUserDescription: {
		en: 'Create a new user with role and department',
		es: 'Crear un nuevo usuario con su rol y departamento',
	},
	editUserDescription: {
		en: 'Modify user role and department',
		es: 'Modificar el rol y departamento del usuario',
	},
	addWorkerDescription: {
		en: 'Add a new worker to the system',
		es: 'Agregar un nuevo trabajador al sistema',
	},
	editWorkerDescription: {
		en: 'Modify worker information',
		es: 'Modificar la información del trabajador',
	},
	addItemDescription: {
		en: 'Add a new item to inventory',
		es: 'Agregar un nuevo artículo al inventario',
	},
	editItemDescription: {
		en: 'Modify item information',
		es: 'Modificar la información del artículo',
	},
	addPurchaseDescription: {
		en: 'Register a new purchase',
		es: 'Registrar una nueva compra',
	},
	editPurchaseDescription: {
		en: 'Modify purchase details',
		es: 'Modificar los detalles de la compra',
	},

	// Machine statuses
	idle: { en: 'Idle', es: 'Inactivo' },
	running: { en: 'Running', es: 'En ejecución' },
	maintenance: { en: 'Maintenance', es: 'Mantenimiento' },
	offline: { en: 'Offline', es: 'Fuera de línea' },

	// Job statuses
	pending: { en: 'Pending', es: 'Pendiente' },
	in_progress: { en: 'In Progress', es: 'En progreso' },
	completed: { en: 'Completed', es: 'Completado' },
	delivered: { en: 'Delivered', es: 'Entregado' },

	// Machine types
	offset_printer: { en: 'Offset Printer', es: 'Impresora Offset' },
	die_cutter: { en: 'Die Cutter', es: 'Troqueladora' },
	guillotine: { en: 'Guillotine', es: 'Guillotina' },
	digital_printer: { en: 'Digital Printer', es: 'Impresora Digital' },
	pre_press: { en: 'Pre-Press', es: 'Pre-Impresión' },
	manual_workshop: { en: 'Manual Workshop', es: 'Taller Manual' },
	delivery: { en: 'Delivery', es: 'Entrega' },

	// Actions
	addJob: { en: 'Add Job', es: 'Agregar Trabajo' },
	updateStatus: { en: 'Update Status', es: 'Actualizar Estado' },
	addOT: { en: 'Add OT', es: 'Agregar OT' },
	addBatch: { en: 'Add Batch', es: 'Agregar Lote' },
	viewTraceability: { en: 'View Traceability', es: 'Ver Trazabilidad' },
	exportPDF: { en: 'Export PDF', es: 'Exportar PDF' },
	assignWorker: { en: 'Assign Worker', es: 'Asignar Trabajador' },
	assignBatch: { en: 'Assign Batch', es: 'Asignar Lote' },

	// OT
	ot: { en: 'Work Order', es: 'Orden de Trabajo' },
	otNumber: { en: 'OT Number', es: 'Número de OT' },
	otList: { en: 'Work Orders', es: 'Órdenes de Trabajo' },
	createOT: { en: 'Create Work Order', es: 'Crear Orden de Trabajo' },

	// Batches & Materials
	batch: { en: 'Batch', es: 'Lote' },
	batches: { en: 'Batches', es: 'Lotes' },
	batchNumber: { en: 'Batch Number', es: 'Número de Lote' },
	paperType: { en: 'Paper Type', es: 'Tipo de Papel' },
	quantityRemaining: { en: 'Quantity Remaining', es: 'Cantidad Disponible' },
	certifications: { en: 'Certifications', es: 'Certificaciones' },

	// Costs
	totalJobCost: { en: 'Total Job Cost', es: 'Costo Total del Trabajo' },
	materialCost: { en: 'Material Cost', es: 'Costo de Material' },
	laborCost: { en: 'Labor Cost', es: 'Costo de Mano de Obra' },
	machineCost: { en: 'Machine Cost', es: 'Costo de Máquina' },
	costBreakdown: { en: 'Cost Breakdown', es: 'Desglose de Costos' },

	// Reports
	costReport: { en: 'Cost Report', es: 'Reporte de Costos' },
	efficiencyReport: { en: 'Efficiency Report', es: 'Reporte de Eficiencia' },
	traceabilityReport: {
		en: 'Traceability Report',
		es: 'Reporte de Trazabilidad',
	},

	// Stats
	totalJobs: { en: 'Total Jobs', es: 'Total de Trabajos' },
	completedJobs: { en: 'Completed Jobs', es: 'Trabajos Completados' },
	pendingJobs: { en: 'Pending Jobs', es: 'Trabajos Pendientes' },
	efficiency: { en: 'Efficiency', es: 'Eficiencia' },
	totalOTs: { en: 'Total OTs', es: 'Total de OTs' },

	// Process flow
	processFlow: { en: 'Process Flow', es: 'Flujo de Proceso' },
	timeline: { en: 'Timeline', es: 'Línea de Tiempo' },

	// Other
	description: { en: 'Description', es: 'Descripción' },
	status: { en: 'Status', es: 'Estado' },
	machine: { en: 'Machine', es: 'Máquina' },
	worker: { en: 'Worker', es: 'Trabajador' },
	submit: { en: 'Submit', es: 'Enviar' },
	cancel: { en: 'Cancel', es: 'Cancelar' },
	save: { en: 'Save', es: 'Guardar' },
	edit: { en: 'Edit', es: 'Editar' },
	delete: { en: 'Delete', es: 'Eliminar' },
	view: { en: 'View', es: 'Ver' },
	overview: { en: 'Overview', es: 'Resumen' },
	noData: { en: 'No data available', es: 'No hay datos disponibles' },
	search: { en: 'Search', es: 'Buscar' },
	createdAt: { en: 'Created At', es: 'Creado el' },
	jobsPerDay: { en: 'Jobs per Day', es: 'Trabajos por día' },

	// Worker management
	workerRoster: { en: 'Worker Roster', es: 'Plantilla de Trabajadores' },
	createRoster: { en: 'Create Roster', es: 'Crear Plantilla' },
	rosterName: { en: 'Roster Name', es: 'Nombre de Plantilla' },
	addToRoster: { en: 'Add to Roster', es: 'Agregar a Plantilla' },
	removeFromRoster: { en: 'Remove from Roster', es: 'Quitar de Plantilla' },

	// Task types
	detachment: { en: 'Detachment', es: 'Desmontaje' },
	revision: { en: 'Revision', es: 'Revisión' },
	packaging: { en: 'Packaging', es: 'Empaque' },
	printing: { en: 'Printing', es: 'Impresión' },
	cutting: { en: 'Cutting', es: 'Corte' },

	// Worker stats
	performance: { en: 'Performance', es: 'Rendimiento' },
	avgTime: { en: 'Avg Time', es: 'Tiempo Promedio' },
	rating: { en: 'Rating', es: 'Calificación' },
	efficiencyScore: { en: 'Efficiency', es: 'Eficiencia' },
	totalTasks: { en: 'Total Tasks', es: 'Tareas Totales' },
	logTask: { en: 'Log Task', es: 'Registrar Tarea' },
	taskType: { en: 'Task Type', es: 'Tipo de Tarea' },
	timeSpent: { en: 'Time Spent (min)', es: 'Tiempo (min)' },
	notes: { en: 'Notes', es: 'Notas' },
	workerStats: { en: 'Worker Statistics', es: 'Estadísticas de Trabajadores' },
	viewStats: { en: 'View Stats', es: 'Ver Estadísticas' },
	allWorkers: { en: 'All Workers', es: 'Todos los Trabajadores' },
	filterByDept: { en: 'Filter by Department', es: 'Filtrar por Departamento' },
	sortBy: { en: 'Sort by', es: 'Ordenar por' },
};

interface LanguageContextType {
	language: Language;
	setLanguage: (lang: Language) => void;
	t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
	undefined
);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const [language, setLanguage] = useState<Language>('en');

	const t = (key: string): string => {
		return translations[key]?.[language] || key;
	};

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
