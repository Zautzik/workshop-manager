import ProtectedRoute from '@/components/ProtectedRoute';
import OperatorWhatsAppView from '@/components/workflow/OperatorWhatsAppView';

export default function OperatorWhatsAppPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'supervisor', 'manager', 'technician']}>
      <OperatorWhatsAppView />
    </ProtectedRoute>
  );
}
