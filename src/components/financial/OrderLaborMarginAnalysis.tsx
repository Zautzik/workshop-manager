'use client';

import { useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrderLaborMargin, useOTs } from '@/hooks/use-queries';
import { Loader2, TrendingUp, TrendingDown, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';

export function OrderLaborMarginAnalysis() {
  const { t } = useLanguage();
  const { data: ots, isLoading: otsLoading } = useOTs();

  // State
  const [selectedOtId, setSelectedOtId] = useState<string>('all');
  const [rangeMonths, setRangeMonths] = useState<number>(6);

  // Calculate date range
  const endDate = endOfMonth(new Date());
  const startDate = startOfMonth(subMonths(endDate, rangeMonths - 1));

  // Fetch margin data
  const { data: margins, isLoading: marginsLoading } = useOrderLaborMargin(
    selectedOtId === 'all' ? undefined : selectedOtId,
    format(startDate, 'yyyy-MM-dd'),
    format(endDate, 'yyyy-MM-dd')
  );

  // Calculate summary stats
  const summary = margins?.reduce(
    (acc, row) => ({
      totalRevenue: acc.totalRevenue + row.revenue,
      totalLaborCost: acc.totalLaborCost + row.total_labor_cost,
      totalIncentiveCost: acc.totalIncentiveCost + row.incentive_cost,
      totalCost: acc.totalCost + row.total_cost,
      totalMargin: acc.totalMargin + row.gross_margin,
      totalHours: acc.totalHours + row.labor_hours,
      totalOTHours: acc.totalOTHours + row.overtime_hours,
    }),
    { 
      totalRevenue: 0, 
      totalLaborCost: 0, 
      totalIncentiveCost: 0, 
      totalCost: 0, 
      totalMargin: 0,
      totalHours: 0,
      totalOTHours: 0,
    }
  );

  const avgMarginPercentage = summary && summary.totalRevenue > 0 
    ? (summary.totalMargin / summary.totalRevenue) * 100 
    : 0;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

  const formatHours = (value: number) => `${value.toFixed(1)}h`;

  const getMarginStatus = (percentage: number) => {
    if (percentage >= 30) return { label: 'Excellent', color: 'bg-green-500', icon: CheckCircle };
    if (percentage >= 20) return { label: 'Good', color: 'bg-blue-500', icon: TrendingUp };
    if (percentage >= 10) return { label: 'Fair', color: 'bg-yellow-500', icon: AlertCircle };
    if (percentage >= 0) return { label: 'Low', color: 'bg-orange-500', icon: AlertCircle };
    return { label: 'Loss', color: 'bg-red-500', icon: TrendingDown };
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>{t('financial.orderLaborMargin') || 'Order Labor Margin'}</CardTitle>
          <CardDescription>
            {t('financial.orderLaborMarginDesc') || 
              'Analyze profitability per order comparing revenue vs labor costs and incentives'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('common.order') || 'Order (Optional)'}
              </label>
              <Select value={selectedOtId} onValueChange={setSelectedOtId}>
                <SelectTrigger>
                  <SelectValue placeholder={otsLoading ? 'Loading...' : 'All orders'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  {ots?.map((ot) => (
                    <SelectItem key={ot.id} value={ot.id}>
                      {ot.ot_number} - {ot.client_name}
                    </SelectItem>
                  ))}
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
                  <SelectItem value="3">Last 3 {t('common.months') || 'months'}</SelectItem>
                  <SelectItem value="6">Last 6 {t('common.months') || 'months'}</SelectItem>
                  <SelectItem value="12">Last 12 {t('common.months') || 'months'}</SelectItem>
                  <SelectItem value="24">Last 24 {t('common.months') || 'months'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {margins && margins.length > 0 && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(summary.totalRevenue / margins.length)} avg/order
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Labor Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalLaborCost)}</div>
              <p className="text-xs text-muted-foreground">
                {((summary.totalLaborCost / summary.totalRevenue) * 100).toFixed(1)}% of revenue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Incentive Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalIncentiveCost)}</div>
              <p className="text-xs text-muted-foreground">
                {((summary.totalIncentiveCost / summary.totalRevenue) * 100).toFixed(1)}% of revenue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gross Margin</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalMargin)}</div>
              <p className="text-xs text-muted-foreground">
                {formatPercentage(avgMarginPercentage)} margin
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Labor Hours</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatHours(summary.totalHours)}</div>
              <p className="text-xs text-muted-foreground">
                {formatPercentage((summary.totalOTHours / summary.totalHours) * 100)} OT
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Margin Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('financial.marginBreakdown') || 'Margin Breakdown'}</CardTitle>
        </CardHeader>
        <CardContent>
          {marginsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !margins || margins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('common.noDataAvailable') || 'No margin data available for selected period'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.otNumber') || 'OT Number'}</TableHead>
                    <TableHead>{t('common.client') || 'Client'}</TableHead>
                    <TableHead>{t('common.orderDate') || 'Order Date'}</TableHead>
                    <TableHead className="text-right">{t('financial.revenue') || 'Revenue'}</TableHead>
                    <TableHead className="text-right">{t('financial.laborCost') || 'Labor Cost'}</TableHead>
                    <TableHead className="text-right">{t('financial.otPremium') || 'OT Premium'}</TableHead>
                    <TableHead className="text-right">{t('financial.incentives') || 'Incentives'}</TableHead>
                    <TableHead className="text-right">{t('financial.totalCost') || 'Total Cost'}</TableHead>
                    <TableHead className="text-right">{t('financial.margin') || 'Margin'}</TableHead>
                    <TableHead className="text-center">{t('financial.status') || 'Status'}</TableHead>
                    <TableHead className="text-right">{t('financial.hours') || 'Hours'}</TableHead>
                    <TableHead className="text-right">{t('financial.costPerHour') || '$/hr'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {margins.map((row) => {
                    const status = getMarginStatus(row.margin_percentage);
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={row.ot_id}>
                        <TableCell className="font-medium">{row.ot_number}</TableCell>
                        <TableCell>{row.client_name}</TableCell>
                        <TableCell>{format(new Date(row.order_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">
                          {formatCurrency(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.base_labor_cost)}</TableCell>
                        <TableCell className="text-right text-orange-600">
                          {formatCurrency(row.overtime_premium)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          {formatCurrency(row.incentive_cost)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(row.total_cost)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <div>{formatCurrency(row.gross_margin)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatPercentage(row.margin_percentage)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${status.color} text-white border-none`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <div>{formatHours(row.labor_hours)}</div>
                          <div className="text-xs text-orange-600">
                            {formatHours(row.overtime_hours)} OT
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.cost_per_hour)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
