export interface DiagnosticsData {
	generatedAt: string;
	health: {
		db: { status: 'ok' | 'error'; latencyMs: number | null; error: string | null };
		counts: {
			otsLast14d: number | null;
			machines: number;
			machinesByStatus: Record<string, number>;
			activeEmployees: number | null;
			workers: number | null;
		};
	};
	webhooks: {
		whatsapp: {
			byStatus: Record<string, number>;
			total: number;
			logs: Array<{
				id: string;
				created_at: string;
				ot_number: string | null;
				message_type: string | null;
				review_status: string;
				operator_name: string | null;
				raw_message: string | null;
			}>;
		};
		connectors: Array<{
			id: string;
			provider: string;
			name: string;
			status: string;
			last_sync_at: string | null;
			last_error: string | null;
			created_at: string;
		}>;
	};
	security: {
		users: Array<{
			id: string;
			email: string;
			role: string;
			created_at: string;
			last_sign_in_at: string | null;
			confirmed_at: string | null;
			inactive: boolean;
		}>;
		inactiveUsers: Array<{ id: string; email: string; last_sign_in_at: string | null }>;
		inactiveThresholdDays: number;
	};
	logs: {
		hrAccessLogs: Array<{
			id: string;
			accessed_at: string;
			accessed_by: string | null;
			access_type: string;
			table_name: string;
			request_method: string | null;
			request_path: string | null;
			purpose: string | null;
			metadata: Record<string, unknown>;
		}>;
	};
	crossModuleChecks: {
		machineWorkerNameCollisions: Array<{ id: string; name: string }>;
		duplicateEmployees: Array<{ name: string; count: number }>;
		employeesWithoutAccount: Array<{ id: string; name: string }>;
		employeesWithoutRate: Array<{ id: string; name: string }>;
	};
	/** Consultas que fallaron de verdad, no que dieron vacío — antes las dos se
	 *  veían idénticas en esta misma pantalla (auditoría 2026-08). */
	queryErrors: string[];
}
