/**
 * @fileoverview Admin Diagnostics Page
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import AppDiagnostics from '@/components/admin/AppDiagnostics';
import { PageShell } from '@/components/layout/PageShell';

export default function DiagnosticsPage() {
	return (
		<ProtectedRoute allowedRoles={['admin']}>
			<PageShell>
				<AppDiagnostics />
			</PageShell>
		</ProtectedRoute>
	);
}
