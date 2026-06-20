'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import TrainingKnowledgeBase from '@/components/admin/TrainingKnowledgeBase';

export default function TrainingPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'hr_manager']}>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">Base de conocimiento y entrenamiento interno.</p>
        </div>
        <TrainingKnowledgeBase />
      </div>
    </ProtectedRoute>
  );
}
