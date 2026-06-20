'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, ArrowRight, Clock, Users, AlertTriangle, DollarSign } from 'lucide-react';
import { useMonthlyPayroll } from '@/hooks/use-financial-queries';

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function Stat({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: string; tone?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone ?? ''}`} />{label}
      </div>
      <div className={`mt-1 text-xl font-bold ${tone ?? 'text-foreground'}`}>{value}</div>
    </div>
  );
}

/**
 * Compact labor-cost readout for Analítica, based on the current month's payroll.
 * The full per-employee payroll is canonical in Personas → /personas/nomina;
 * this card hands off there. Degrades gracefully if the payroll calculation
 * can't run (known worker→employee mapping drift) instead of throwing.
 */
export default function LaborCostSummary() {
  const now = new Date();
  const { data, isLoading, isError } = useMonthlyPayroll(now.getFullYear(), now.getMonth() + 1);

  const rows = (data ?? []) as Array<{ gross_pay: number; overtime_hours: number }>;
  const grossTotal = rows.reduce((s, r) => s + Number(r.gross_pay ?? 0), 0);
  const overtimeHours = rows.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4" />Costo laboral del mes
        </CardTitle>
        <Link
          href="/personas/nomina"
          className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
        >
          Ver nómina completa <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : isError ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Nómina no disponible este mes</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                No se pudo calcular (asignaciones sin empleado o sin tarifa).
                Revisa el detalle en{' '}
                <Link href="/personas/nomina" className="text-primary hover:underline">Personas → Nómina</Link>.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={DollarSign} label="Costo bruto" value={fmtMoney(grossTotal)} tone="text-green-500" />
            <Stat icon={Clock} label="Horas extra" value={`${Math.round(overtimeHours)} h`} tone="text-amber-500" />
            <Stat icon={Users} label="Empleados" value={String(rows.length)} tone="text-indigo-500" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
