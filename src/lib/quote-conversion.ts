/**
 * Quotes per month and what became of them (audit M8): won = signed or
 * converted to production, lost = rejected or expired, open = still a draft or
 * sent. Pure — the read route fetches `vistos_buenos` and calls this.
 */
export interface QuoteMonth {
  month: string; // YYYY-MM
  quoted: number;
  won: number;
  lost: number;
  open: number;
}

const WON = new Set(['signed', 'converted']);
const LOST = new Set(['rejected', 'expired']);

export function quoteConversionByMonth(rows: Array<{ status: string; created_at: string }>): QuoteMonth[] {
  const byMonth = new Map<string, QuoteMonth>();
  for (const r of rows) {
    const month = String(r.created_at).slice(0, 7);
    const g = byMonth.get(month) ?? { month, quoted: 0, won: 0, lost: 0, open: 0 };
    g.quoted++;
    if (WON.has(r.status)) g.won++;
    else if (LOST.has(r.status)) g.lost++;
    else g.open++;
    byMonth.set(month, g);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Share of decided quotes that were won; null when nothing was decided yet. */
export function winRate(m: Pick<QuoteMonth, 'won' | 'lost'>): number | null {
  const decided = m.won + m.lost;
  return decided > 0 ? Math.round((m.won / decided) * 100) : null;
}
