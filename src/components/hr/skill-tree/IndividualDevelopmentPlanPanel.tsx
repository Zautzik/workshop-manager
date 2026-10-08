import { Button } from '@/components/ui/button';

export function IndividualDevelopmentPlanPanel({
  employeeName,
  templateName,
  readiness,
  goals30,
  goals60,
  goals90,
  managerNotes,
  signoffManager,
  signoffDate,
  onManagerNotesChange,
  onSignoffManagerChange,
  onSignoffDateChange,
  onCopy,
  onDownload,
}: {
  employeeName: string;
  templateName: string;
  readiness: number;
  goals30: string[];
  goals60: string[];
  goals90: string[];
  managerNotes: string;
  signoffManager: string;
  signoffDate: string;
  onManagerNotesChange: (value: string) => void;
  onSignoffManagerChange: (value: string) => void;
  onSignoffDateChange: (value: string) => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="mx-4 mt-3 rounded-lg border border-[#1e293b] bg-[#0d1117] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Individual Development Plan</p>
          <p className="text-sm text-slate-100 font-semibold">{employeeName} - {templateName}</p>
          <p className="text-[11px] text-cyan-300 mt-0.5">Role readiness: {readiness}%</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCopy}>Copy Plan</Button>
          <Button size="sm" variant="outline" onClick={onDownload}>Descargar .txt</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
          <p className="text-xs font-semibold text-slate-100">30 Days</p>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc pl-4">
            {goals30.map(goal => (
              <li key={`30-${goal}`}>{goal}</li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
          <p className="text-xs font-semibold text-slate-100">60 Days</p>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc pl-4">
            {goals60.map(goal => (
              <li key={`60-${goal}`}>{goal}</li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
          <p className="text-xs font-semibold text-slate-100">90 Days</p>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-300 list-disc pl-4">
            {goals90.map(goal => (
              <li key={`90-${goal}`}>{goal}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded border border-[#1e293b] bg-[#0a0f15] p-2.5">
        <p className="text-xs font-semibold text-slate-100">Revisión y aprobación del encargado</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Nombre del revisor</label>
            <input
              type="text"
              value={signoffManager}
              onChange={(e) => onSignoffManagerChange(e.target.value)}
              placeholder="Encargado / Supervisor"
              className="w-full rounded border border-[#1e293b] bg-[#0d1117] px-2 py-1.5 text-xs text-slate-200"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Fecha de revisión</label>
            <input
              type="date"
              value={signoffDate}
              onChange={(e) => onSignoffDateChange(e.target.value)}
              className="w-full rounded border border-[#1e293b] bg-[#0d1117] px-2 py-1.5 text-xs text-slate-200"
            />
          </div>
        </div>
        <div className="mt-2">
          <label className="text-[11px] text-slate-500 block mb-1">Notas del encargado</label>
          <textarea
            value={managerNotes}
            onChange={(e) => onManagerNotesChange(e.target.value)}
            placeholder="Observaciones, acciones de apoyo, restricciones y notas de aprobación..."
            rows={4}
            className="w-full rounded border border-[#1e293b] bg-[#0d1117] px-2 py-1.5 text-xs text-slate-200"
          />
        </div>
      </div>
    </div>
  );
}
