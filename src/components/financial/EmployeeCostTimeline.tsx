'use client';

import { useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEmployeeCostTimeline } from '@/hooks/use-financial-queries';
import { useWorkers } from '@/hooks/use-operations-queries';
import { Loader2, TrendingUp, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export function EmployeeCostTimeline() {
  const { t } = useLanguage();
  const { data: workers, isLoading: workersLoading } = useWorkers();

  // State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [granularity, setGranularity] = useState<'week' | 'month'>('month');
  const [rangeMonths, setRangeMonths] = useState<number>(6);

  // Calculate date range
  const endDate = endOfMonth(new Date());
  const startDate = startOfMonth(subMonths(endDate, rangeMonths - 1));

  // Fetch timeline data
  const { data: timeline, isLoading: timelineLoading } = useEmployeeCostTimeline(
    selectedEmployeeId,
    format(startDate, 'yyyy-MM-dd'),
    format(endDate, 'yyyy-MM-dd'),
    granularity
  );

  // Calculate summary stats
  const summary = timeline?.reduce(
    (acc, row) => ({
      totalHours: acc.totalHours + row.base_hours + row.ot50_hours + row.ot100_hours,
      totalOTHours: acc.totalOTHours + row.ot50_hours + row.ot100_hours,
      totalCost: acc.totalCost + row.total_labor_cost,
      totalOTPremium: acc.totalOTPremium + row.overtime_premium,
      totalIncentives: acc.totalIncentives + row.incentive_pay,
    }),
    { totalHours: 0, totalOTHours: 0, totalCost: 0, totalOTPremium: 0, totalIncentives: 0 }
  );

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString('es-CL')}`;

  const formatHours = (value: number) => `${Math.round(value)}h`;

  const formatPeriod = (start: string, end: string) => {
    if (granularity === 'week') {
      return `${format(new Date(start), 'MMM d')} - ${format(new Date(end), 'MMM d, yyyy')}`;
    }
    return format(new Date(start), 'MMMM yyyy');
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>{t('financial.employeeCostTimeline') || 'Employee Cost Timeline'}</CardTitle>
          <CardDescription>
            {t('financial.employeeCostTimelineDesc') || 
              'View per-employee labor cost breakdown over time including base hours, overtime, premiums, and incentives'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('common.employee') || 'Employee'}
              </label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder={workersLoading ? 'Loading...' : 'Select employee'} />
                </SelectTrigger>
                <SelectContent>
                  {workers?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('common.granularity') || 'Granularity'}
              </label>
              <Select value={granularity} onValueChange={(v) => setGranularity(v as 'week' | 'month')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">{t('common.weekly') || 'Weekly'}</SelectItem>
                  <SelectItem value="month">{t('common.monthly') || 'Monthly'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('common.timeRange') || 'Time Range'}
              </label>
              <Select value={rangeMonths.toString()} onValueChange={(v) => setRangeMonths(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 {t('common.months') || 'months'}</SelectItem>
                  <SelectItem value="6">6 {t('common.months') || 'months'}</SelectItem>
                  <SelectItem value="12">12 {t('common.months') || 'months'}</SelectItem>
                  <SelectItem value="24">24 {t('common.months') || 'months'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {selectedEmployeeId && timeline && timeline.length > 0 && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Horas totales</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatHours(summary.totalHours)}</div>
              <p className="text-xs text-muted-foreground">
                {formatHours(summary.totalHours / (timeline?.length || 1))} avg/period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Horas de OT</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatHours(summary.totalOTHours)}</div>
              <p className="text-xs text-muted-foreground">
                {Math.round((summary.totalOTHours / summary.totalHours) * 100)}% del total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">OT Premium</CardTitle>
              <TrendingUp className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalOTPremium)}</div>
              <p className="text-xs text-muted-foreground">
                {Math.round((summary.totalOTPremium / summary.totalCost) * 100)}% del costo
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Incentives</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalIncentives)}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(summary.totalIncentives / (timeline?.length || 1))} avg/period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costo total de mano de obra</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalCost)}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(summary.totalCost / (timeline?.length || 1))} avg/period
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('financial.costBreakdown') || 'Cost Breakdown'}</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedEmployeeId ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('common.selectEmployeePrompt') || 'Select an employee to view cost timeline'}
            </div>
          ) : timelineLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !timeline || timeline.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('common.noDataAvailable') || 'No cost data available for selected period'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.period') || 'Period'}</TableHead>
                    <TableHead className="text-right">{t('financial.baseHours') || 'Base Hours'}</TableHead>
                    <TableHead className="text-right">{t('financial.ot50Hours') || 'OT 50%'}</TableHead>
                    <TableHead className="text-right">{t('financial.ot100Hours') || 'OT 100%'}</TableHead>
                    <TableHead className="text-right">{t('financial.basePay') || 'Base Pay'}</TableHead>
                    <TableHead className="text-right">{t('financial.otPremium') || 'OT Premium'}</TableHead>
                    <TableHead className="text-right">{t('financial.nightDiff') || 'Night Diff'}</TableHead>
                    <TableHead className="text-right">{t('financial.weekendDiff') || 'Weekend Diff'}</TableHead>
                    <TableHead className="text-right">{t('financial.incentives') || 'Incentives'}</TableHead>
                    <TableHead className="text-right font-bold">{t('financial.totalCost') || 'Total Cost'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeline.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {formatPeriod(row.period_start, row.period_end)}
                      </TableCell>
                      <TableCell className="text-right">{formatHours(row.base_hours)}</TableCell>
                      <TableCell className="text-right">{formatHours(row.ot50_hours)}</TableCell>
                      <TableCell className="text-right">{formatHours(row.ot100_hours)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.base_pay)}</TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatCurrency(row.overtime_premium)}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(row.night_differential)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.weekend_differential)}</TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(row.incentive_pay)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(row.total_labor_cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
