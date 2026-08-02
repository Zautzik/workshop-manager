import { describe, it, expect } from 'vitest';
import {
  evaluateAlarm, actionableAlarms, summarizeAlarms, compareAlarms,
  DEFAULT_THRESHOLDS, type AlarmInput,
} from '../cost-alarms';

const ot = (over: Partial<AlarmInput> = {}): AlarmInput => ({
  ot_id: 'a', ot_number: '40497', client_name: 'Cliente',
  revenue: 1_000_000, estimated_cost: 700_000, actual_cost: 700_000,
  unreliable: false, ...over,
});

describe('perder plata y pasarse del presupuesto son dos preguntas distintas', () => {
  it('detecta pérdida: costó más de lo que se cobró', () => {
    const a = evaluateAlarm(ot({ revenue: 1_000_000, actual_cost: 1_200_000 }));
    expect(a.level).toBe('perdida');
    expect(a.margin_amount).toBe(-200_000);
    expect(a.reasons[0]).toContain('perdió $200.000');
  });

  it('un trabajo puede estar DENTRO del presupuesto y aun así perder plata', () => {
    // Se estimó 1,5M, costó 1,4M (bajo lo estimado), pero se cobró 1,0M.
    const a = evaluateAlarm(ot({ revenue: 1_000_000, estimated_cost: 1_500_000, actual_cost: 1_400_000 }));
    expect(a.level).toBe('perdida');
    expect(a.overrun_pct).toBeLessThan(0);   // no hubo sobrecosto
  });

  it('y puede pasarse mucho del presupuesto y seguir dejando margen', () => {
    const a = evaluateAlarm(ot({ revenue: 2_000_000, estimated_cost: 500_000, actual_cost: 800_000 }));
    expect(a.level).toBe('sobrecosto');
    expect(a.margin_pct).toBe(60);
    expect(a.overrun_pct).toBe(60);
  });

  it('cuando fallan las dos cosas, reporta las dos razones', () => {
    const a = evaluateAlarm(ot({ revenue: 1_000_000, estimated_cost: 800_000, actual_cost: 1_300_000 }));
    expect(a.level).toBe('perdida');           // manda la peor
    expect(a.reasons).toHaveLength(2);         // pero no se pierde la otra
    expect(a.reasons.join(' ')).toContain('por sobre lo calculado');
  });
});

describe('margen bajo el piso', () => {
  it('avisa aunque no pierda plata', () => {
    const a = evaluateAlarm(ot({ revenue: 1_000_000, actual_cost: 950_000 }));
    expect(a.level).toBe('margen_critico');
    expect(a.margin_pct).toBe(5);
    expect(a.reasons[0]).toContain('piso de 10%');
  });

  it('justo en el piso no alarma', () => {
    // estimado = real, para aislar la condición de margen del sobrecosto.
    const a = evaluateAlarm(ot({ revenue: 1_000_000, estimated_cost: 900_000, actual_cost: 900_000 }));
    expect(a.margin_pct).toBe(DEFAULT_THRESHOLDS.minMarginPct);
    expect(a.level).toBe('ok');
  });

  it('margen en el piso PERO con sobrecosto igual alarma: son dos preguntas', () => {
    const a = evaluateAlarm(ot({ revenue: 1_000_000, estimated_cost: 700_000, actual_cost: 900_000 }));
    expect(a.margin_pct).toBe(10);        // el margen está bien…
    expect(a.level).toBe('sobrecosto');   // …pero se calculó 200.000 de menos
    expect(a.overrun_pct).toBe(28.6);
  });

  it('el piso es configurable', () => {
    const a = evaluateAlarm(
      ot({ revenue: 1_000_000, actual_cost: 800_000 }),
      { overrunPct: 15, minMarginPct: 25 }
    );
    expect(a.level).toBe('margen_critico');   // 20% < 25%
  });
});

describe('no alarma sobre lo que no sabe', () => {
  it('una OT sin costo real no dispara nada, ni bueno ni malo', () => {
    // Aritméticamente el margen sería 100%. Gritar "excelente" es tan falso
    // como gritar "pérdida".
    const a = evaluateAlarm(ot({ actual_cost: 0, unreliable: true }));
    expect(a.level).toBe('sin_datos');
    expect(a.reasons[0]).toContain('no se puede saber');
  });

  it('marcada como no confiable manda, aunque tenga cifras', () => {
    const a = evaluateAlarm(ot({ revenue: 1_000_000, actual_cost: 5_000_000, unreliable: true }));
    expect(a.level).toBe('sin_datos');   // datos sembrados: no se alarma
  });

  it('sin precio cargado no inventa un margen', () => {
    const a = evaluateAlarm(ot({ revenue: 0, actual_cost: 500_000 }));
    expect(a.margin_pct).toBeNull();
    expect(a.reasons.join(' ')).toContain('no tiene precio cargado');
  });
});

describe('la severidad se mide en plata, no en porcentaje', () => {
  it('una pérdida grande pesa más que un porcentaje feo sobre poca plata', () => {
    const grande = evaluateAlarm(ot({ ot_id: 'g', revenue: 10_000_000, actual_cost: 16_000_000 }));
    const chica  = evaluateAlarm(ot({ ot_id: 'c', revenue: 100_000, actual_cost: 300_000 }));
    expect(chica.margin_pct!).toBeLessThan(grande.margin_pct!);   // -200% vs -60%
    // …pero la grande cuesta $6.000.000 y la chica $200.000.
    expect([grande, chica].sort(compareAlarms)[0].ot_id).toBe('g');
  });

  it('la pérdida siempre va antes que el sobrecosto', () => {
    const perdida = evaluateAlarm(ot({ ot_id: 'p', revenue: 100_000, actual_cost: 110_000 }));
    const sobre = evaluateAlarm(ot({ ot_id: 's', revenue: 9_000_000, estimated_cost: 1_000_000, actual_cost: 5_000_000 }));
    expect([sobre, perdida].sort(compareAlarms)[0].ot_id).toBe('p');
  });
});

describe('resumen para el dueño', () => {
  it('dice cuánta plata se perdió en total', () => {
    const alarms = [
      evaluateAlarm(ot({ ot_id: '1', revenue: 1_000_000, actual_cost: 1_300_000 })),
      evaluateAlarm(ot({ ot_id: '2', revenue: 2_000_000, actual_cost: 2_500_000 })),
      evaluateAlarm(ot({ ot_id: '3', revenue: 1_000_000, actual_cost: 500_000 })),
    ];
    const s = summarizeAlarms(alarms);
    expect(s.perdida).toBe(2);
    expect(s.dinero_perdido).toBe(800_000);
    expect(s.headline).toContain('$800.000');
  });

  it('si no hay pérdidas lo dice claro', () => {
    const s = summarizeAlarms([evaluateAlarm(ot({ revenue: 1_000_000, actual_cost: 500_000 }))]);
    expect(s.perdida).toBe(0);
    expect(s.headline).toBe('Ningún trabajo en pérdida.');
  });

  it('actionableAlarms deja fuera lo que está en regla y lo que no se sabe', () => {
    const alarms = [
      evaluateAlarm(ot({ ot_id: 'ok', revenue: 1_000_000, actual_cost: 500_000 })),
      evaluateAlarm(ot({ ot_id: 'nd', unreliable: true, actual_cost: 0 })),
      evaluateAlarm(ot({ ot_id: 'mal', revenue: 1_000_000, actual_cost: 1_200_000 })),
    ];
    const acc = actionableAlarms(alarms);
    expect(acc).toHaveLength(1);
    expect(acc[0].ot_id).toBe('mal');
  });
});
