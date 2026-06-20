/**
 * @fileoverview Admin Diagnostics Page
 */
'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import AppDiagnostics from '@/components/admin/AppDiagnostics';

export default function DiagnosticsPage() {
	return (
		<ProtectedRoute allowedRoles={['admin']}>
			<div className="p-6 md:p-8">
				<AppDiagnostics />
			</div>
		</ProtectedRoute>
	);
}
