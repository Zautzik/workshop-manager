'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useMonthlyPayroll } from '@/hooks/use-queries';

const getCurrentMonthValue = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
};

export function MonthlyPayrollCalculator() {
  const [monthValue, setMonthValue] = useState<string>(getCurrentMonthValue());

  const [yearPart, monthPart] = monthValue.split('-');
  const parsedYear = Number(yearPart);
  const parsedMonth = Number(monthPart);
  const now = new Date();

  const selectedYear =
    Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 9999
      ? parsedYear
      : now.getFullYear();
  const selectedMonth =
    Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : now.getMonth() + 1;

  const { data: rows = [], isLoading, error } = useMonthlyPayroll(selectedYear, selectedMonth);

  const totals = useMemo(() => {
    return (rows as any[]).reduce(
      (acc, row: any) => {
        acc.regularHours += Number(row.regular_hours || 0);
        acc.overtimeHours += Number(row.overtime_hours || 0);
        acc.basePay += Number(row.base_pay || 0);
        acc.overtimePay += Number(row.overtime_pay || 0);
        acc.nightDifferential += Number(row.night_differential || 0);
        acc.weekendDifferential += Number(row.weekend_differential || 0);
        acc.incentives += Number(row.incentives || 0);
        acc.grossPay += Number(row.gross_pay || 0);
        return acc;
      },
      {
        regularHours: 0,
        overtimeHours: 0,
        basePay: 0,
        overtimePay: 0,
        nightDifferential: 0,
        weekendDifferential: 0,
        incentives: 0,
        grossPay: 0,
      }
    );
  }, [rows]);

  const currency = (rows as any[])[0]?.currency_code || 'USD';

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Monthly Payroll Calculator</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='max-w-xs'>
            <label className='text-sm font-medium text-foreground'>Month</label>
            <Input
              type='month'
              value={monthValue}
              onChange={(event) =>
                setMonthValue(event.target.value || getCurrentMonthValue())
              }
              className='mt-1'
            />
          </div>

          {isLoading ? (
            <p className='text-sm text-muted-foreground'>Calculating payroll...</p>
          ) : error ? (
            <p className='text-sm text-destructive'>
              {(error as Error).message || 'Failed to calculate payroll.'}
            </p>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm text-muted-foreground'>Regular Hours</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-2xl font-semibold'>{totals.regularHours.toFixed(2)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm text-muted-foreground'>Overtime Hours</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-2xl font-semibold'>{totals.overtimeHours.toFixed(2)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm text-muted-foreground'>Incentives</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-2xl font-semibold'>{currency} {totals.incentives.toFixed(2)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm text-muted-foreground'>Gross Payroll</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-2xl font-semibold'>{currency} {totals.grossPay.toFixed(2)}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employee Payroll Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b'>
                  <th className='text-left py-2 px-3'>Employee</th>
                  <th className='text-right py-2 px-3'>Regular Hrs</th>
                  <th className='text-right py-2 px-3'>OT Hrs</th>
                  <th className='text-right py-2 px-3'>Base Pay</th>
                  <th className='text-right py-2 px-3'>OT Pay</th>
                  <th className='text-right py-2 px-3'>Night</th>
                  <th className='text-right py-2 px-3'>Weekend</th>
                  <th className='text-right py-2 px-3'>Incentives</th>
                  <th className='text-right py-2 px-3'>Gross</th>
                </tr>
              </thead>
              <tbody>
                {(rows as any[]).map((row: any) => (
                  <tr key={row.employee_id} className='border-b hover:bg-muted/40'>
                    <td className='py-2 px-3'>{row.employee_name}</td>
                    <td className='py-2 px-3 text-right'>{Number(row.regular_hours || 0).toFixed(2)}</td>
                    <td className='py-2 px-3 text-right'>{Number(row.overtime_hours || 0).toFixed(2)}</td>
                    <td className='py-2 px-3 text-right'>{currency} {Number(row.base_pay || 0).toFixed(2)}</td>
                    <td className='py-2 px-3 text-right'>{currency} {Number(row.overtime_pay || 0).toFixed(2)}</td>
                    <td className='py-2 px-3 text-right'>{currency} {Number(row.night_differential || 0).toFixed(2)}</td>
                    <td className='py-2 px-3 text-right'>{currency} {Number(row.weekend_differential || 0).toFixed(2)}</td>
                    <td className='py-2 px-3 text-right'>{currency} {Number(row.incentives || 0).toFixed(2)}</td>
                    <td className='py-2 px-3 text-right font-semibold'>{currency} {Number(row.gross_pay || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {(rows as any[]).length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={9} className='py-6 text-center text-muted-foreground'>
                      No payroll data for selected month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
