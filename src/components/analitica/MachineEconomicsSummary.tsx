'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, ArrowRight, TrendingUp, Wallet, PiggyBank, DollarSign } from 'lucide-react';
import { useMachineCosts, useEquipmentInvestments } from '@/hooks/use-financial-queries';

const fmtMoney = (n: number) =>
  `$${Math.round(n).toLocaleString('es-CO')}`;

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
 * Compact machine-economics readout for Analítica. The full analysis (operating
 * cost breakdown + ROI/payback) is canonical in Equipos → /equipos/economia;
 * this card surfaces the headline figures and hands off there.
 */
export default function MachineEconomicsSummary() {
  const { data: costs, isLoading: l1 } = useMachineCosts();
  const { data: investments, isLoading: l2 } = useEquipmentInvestments();
  const loading = l1 || l2;

  const costRows = (costs ?? []) as Array<{ total_operating_cost: number | null; revenue_generated: number | null }>;
  const invRows = (investments ?? []) as Array<{ purchase_cost: number | null; estimated_annual_savings: number | null }>;

  const opCost = costRows.reduce((s, r) => s + Number(r.total_operating_cost ?? 0), 0);
  const revenue = costRows.reduce((s, r) => s + Number(r.revenue_generated ?? 0), 0);
  const invested = invRows.reduce((s, r) => s + Number(r.purchase_cost ?? 0), 0);
  const annualSavings = invRows.reduce((s, r) => s + Number(r.estimated_annual_savings ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Cpu className="h-4 w-4" />Economía de equipos
        </CardTitle>
        <Link
          href="/equipos/economia"
          className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
        >
          Ver análisis completo <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={Wallet} label="Costo operativo" value={fmtMoney(opCost)} tone="text-amber-500" />
            <Stat icon={DollarSign} label="Ingresos generados" value={fmtMoney(revenue)} tone="text-green-500" />
            <Stat icon={TrendingUp} label="Inversión en flota" value={fmtMoney(invested)} tone="text-indigo-500" />
            <Stat icon={PiggyBank} label="Ahorro anual est." value={fmtMoney(annualSavings)} tone="text-teal-500" />
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Gestión detallada de costos por máquina, depreciación y retorno de inversión en{' '}
          <Link href="/equipos/economia" className="text-primary hover:underline">Equipos → Economía</Link>.
        </p>
      </CardContent>
    </Card>
  );
}
