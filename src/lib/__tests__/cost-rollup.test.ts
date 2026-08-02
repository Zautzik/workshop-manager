import { describe, it, expect } from 'vitest';
import { rollupCosts, aggregateRollup, SYNTHETIC_SOURCES, type CostLine, type OTRevenue } from '../cost-rollup';

const ot = (ot_id: string, revenue: number): OTRevenue =>
  ({ ot_id, ot_number: ot_id, client_name: 'Cliente', revenue });

const line = (ot_id: string, kind: CostLine['kind'], total: number, source = 'manual', category: CostLine['category'] = 'material'): CostLine =>
  ({ ot_id, kind, category, total, source });

describe('estimación y costo real no se suman', () => {
  it('separa estimate de actual', () => {
    const [r] = rollupCosts(
      [line('A', 'estimate', 900_000, 'wizard'), line('A', 'actual', 700_000)],
      [ot('A', 1_000_000)]
    );
    expect(r.estimated_cost).toBe(900_000);
    expect(r.actual_cost).toBe(700_000);
    // El margen usa el REAL, no el presupuestado.
    expect(r.gross_margin).toBe(300_000);
    expect(r.margin_pct).toBe(30);
  });

  it('lo comprometido va aparte: ya se pidió pero no se recibió', () => {
    const [r] = rollupCosts(
      [line('A', 'committed', 200_000, 'purchase'), line('A', 'actual', 500_000)],
      [ot('A', 1_000_000)]
    );
    expect(r.committed_cost).toBe(200_000);
    expect(r.actual_cost).toBe(500_000);
  });
});

describe('la siembra de demo se excluye por defecto', () => {
  const lines = [line('A', 'actual', 40, 'seed'), line('A', 'actual', 600_000, 'manual')];

  it('por defecto no la cuenta', () => {
    const [r] = rollupCosts(lines, [ot('A', 1_000_000)]);
    expect(r.actual_cost).toBe(600_000);
  });

  it('se puede incluir a propósito', () => {
    const [r] = rollupCosts(lines, [ot('A', 1_000_000)], { includeSeed: true });
    expect(r.actual_cost).toBe(600_040);
  });

  it('aunque se excluya, la OT queda marcada como no confiable', () => {
    // Que la excluyamos del cálculo no borra el hecho de que está contaminada.
    const [r] = rollupCosts(lines, [ot('A', 1_000_000)]);
    expect(r.provenance.seedLines).toBe(1);
    expect(r.unreliable).toBe(true);
    expect(r.provenance.label).toContain('demostración');
  });

  it('"seed" es la única fuente sintética declarada', () => {
    expect([...SYNTHETIC_SOURCES]).toEqual(['seed']);
  });
});

describe('un margen sin costo real es la mentira más cara', () => {
  it('sin ninguna línea de costo, marca no confiable en vez de reportar 100% de utilidad', () => {
    const [r] = rollupCosts([], [ot('A', 5_000_000)]);
    expect(r.gross_margin).toBe(5_000_000);   // aritméticamente cierto…
    expect(r.unreliable).toBe(true);           // …y explícitamente inutilizable
    expect(r.provenance.label).toContain('Sin ninguna línea de costo');
  });

  it('sólo con estimaciones tampoco alcanza', () => {
    const [r] = rollupCosts([line('A', 'estimate', 800_000, 'wizard')], [ot('A', 1_000_000)]);
    expect(r.unreliable).toBe(true);
    expect(r.provenance.label).toContain('Sin costo real');
  });

  it('con una línea real sí es utilizable', () => {
    const [r] = rollupCosts([line('A', 'actual', 800_000)], [ot('A', 1_000_000)]);
    expect(r.unreliable).toBe(false);
    expect(r.margin_pct).toBe(20);
  });

  it('sin ingreso no hay margen que calcular', () => {
    const [r] = rollupCosts([line('A', 'actual', 500_000)], [ot('A', 0)]);
    expect(r.unreliable).toBe(true);
    expect(r.margin_pct).toBeNull();
  });
});

describe('procedencia: de dónde salió cada peso', () => {
  it('distingue lo real de lo migrado', () => {
    const [r] = rollupCosts(
      [line('A', 'actual', 300_000, 'manual'), line('A', 'actual', 200_000, 'legacy')],
      [ot('A', 1_000_000)]
    );
    expect(r.provenance.realLines).toBe(1);
    expect(r.provenance.legacyLines).toBe(1);
    expect(r.provenance.confidence).toBe(50);
    expect(r.provenance.label).toContain('migrada');
  });

  it('todo real = confianza 100', () => {
    const [r] = rollupCosts(
      [line('A', 'actual', 300_000, 'manual'), line('A', 'actual', 200_000, 'whatsapp')],
      [ot('A', 1_000_000)]
    );
    expect(r.provenance.confidence).toBe(100);
  });

  it('toda fila trae una explicación en español, nunca vacía', () => {
    const casos = [
      rollupCosts([], [ot('A', 100)]),
      rollupCosts([line('A', 'estimate', 50, 'wizard')], [ot('A', 100)]),
      rollupCosts([line('A', 'actual', 50, 'seed')], [ot('A', 100)]),
      rollupCosts([line('A', 'actual', 50, 'manual')], [ot('A', 100)]),
    ];
    for (const [r] of casos) {
      expect(r.provenance.label.length).toBeGreaterThan(15);
    }
  });
});

describe('desglose por categoría', () => {
  it('sólo agrupa costo real', () => {
    const [r] = rollupCosts(
      [
        line('A', 'actual', 300_000, 'manual', 'material'),
        line('A', 'actual', 200_000, 'manual', 'labor'),
        line('A', 'estimate', 999_999, 'wizard', 'material'),
      ],
      [ot('A', 1_000_000)]
    );
    expect(r.by_category.material).toBe(300_000);
    expect(r.by_category.labor).toBe(200_000);
    expect(r.by_category.machine).toBe(0);
  });
});

describe('los totales del período son igual de honestos', () => {
  it('descarta las OTs no confiables del margen agregado', () => {
    const rows = rollupCosts(
      [line('A', 'actual', 600_000), line('C', 'actual', 10, 'seed')],
      [ot('A', 1_000_000), ot('B', 2_000_000), ot('C', 3_000_000)]
    );
    const t = aggregateRollup(rows);
    // B no tiene costo; C está sembrada. Sólo A entra.
    expect(t.ots_total).toBe(3);
    expect(t.ots_confiables).toBe(1);
    expect(t.revenue).toBe(1_000_000);
    expect(t.gross_margin).toBe(400_000);
    expect(t.reason).toContain('1 de 3');
  });

  it('si ninguna es confiable, lo dice en vez de mostrar cero', () => {
    const rows = rollupCosts([], [ot('A', 1_000_000)]);
    const t = aggregateRollup(rows);
    expect(t.ots_confiables).toBe(0);
    expect(t.margin_pct).toBeNull();
    expect(t.reason).toContain('no se puede calcular margen');
  });

  it('sin OTs no inventa un período', () => {
    expect(aggregateRollup([]).reason).toContain('No hay OTs');
  });
});
