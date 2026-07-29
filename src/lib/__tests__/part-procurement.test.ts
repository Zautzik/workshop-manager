import { describe, it, expect } from 'vitest';
import {
  evaluatePart,
  suggestedMinStock,
  comparePartUrgency,
  SAFETY_DAYS,
  IMPORT_BUFFER_DAYS,
  DEFAULT_LEAD_TIME_DAYS,
} from '../part-procurement';

/**
 * Los dos programas que tiene que soportar el taller:
 *   · Ryobi 524GS — se mide en IMPRESIONES
 *   · Roland      — se mide en HORAS
 * La misma aritmética debe servir para ambos sin convertir nada.
 */

describe('evaluatePart — programa por impresiones (Ryobi)', () => {
  it('calcula vida consumida desde el último cambio, no desde cero', () => {
    const r = evaluatePart({
      usageCounter: 12_000_000,
      lastReplacedUsage: 10_000_000,
      expectedLifeUsage: 8_000_000, // mantilla
      usagePerDay: 20_000,
      leadTimeDays: 30,
    });
    // Consumió 2M de los 8M, no 12M.
    expect(r.usageSinceReplacement).toBe(2_000_000);
    expect(r.lifeUsedPct).toBe(25);
    expect(r.remainingUsage).toBe(6_000_000);
  });

  it('traduce impresiones restantes a días usando el ritmo real', () => {
    const r = evaluatePart({
      usageCounter: 2_000_000,
      lastReplacedUsage: 0,
      expectedLifeUsage: 8_000_000,
      usagePerDay: 20_000,
      leadTimeDays: 30,
      criticality: 'media',
    });
    // 6M restantes / 20k por día = 300 días
    expect(r.daysRemaining).toBe(300);
    expect(r.status).toBe('ok');
  });
});

describe('evaluatePart — programa por horas (Roland)', () => {
  it('usa exactamente la misma aritmética con horas', () => {
    const r = evaluatePart({
      usageCounter: 3_800,
      lastReplacedUsage: 0,
      expectedLifeUsage: 4_000, // filtro hidráulico cada 4.000 h
      usagePerDay: 6,           // ~6 h de máquina por día
      leadTimeDays: 20,
      criticality: 'alta',
    });
    expect(r.remainingUsage).toBe(200);
    expect(r.daysRemaining).toBe(33); // 200 / 6
    // lead 20 + holgura alta 15 = 35 → 33 - 35 = -2 → ya va tarde
    expect(r.effectiveLeadDays).toBe(35);
    expect(r.status).toBe('atrasado');
  });
});

describe('la pregunta que importa: ¿alcanzo a pedirla?', () => {
  it('marca atrasado cuando el repuesto llega después de la falla', () => {
    const r = evaluatePart({
      usageCounter: 7_600_000,
      lastReplacedUsage: 0,
      expectedLifeUsage: 8_000_000,
      usagePerDay: 20_000,   // 400k restantes → 20 días
      leadTimeDays: 60,
      criticality: 'baja',   // sin holgura extra
    });
    expect(r.daysRemaining).toBe(20);
    expect(r.effectiveLeadDays).toBe(60);
    expect(r.slackDays).toBe(-40);
    expect(r.status).toBe('atrasado');
    expect(r.reason).toContain('40 días tarde');
  });

  it('avisa "pedir ahora" cuando quedan dos semanas de margen', () => {
    const r = evaluatePart({
      usageCounter: 0,
      expectedLifeUsage: 1_000,
      usagePerDay: 10,       // 100 días de vida
      leadTimeDays: 90,
      criticality: 'baja',
    });
    expect(r.daysRemaining).toBe(100);
    expect(r.slackDays).toBe(10);
    expect(r.status).toBe('pedir_ahora');
  });

  it('una pieza crítica se pide mucho antes que una de baja criticidad', () => {
    const base = {
      usageCounter: 0,
      expectedLifeUsage: 1_000,
      usagePerDay: 10, // 100 días
      leadTimeDays: 40,
    } as const;

    const baja = evaluatePart({ ...base, criticality: 'baja' });
    const critica = evaluatePart({ ...base, criticality: 'critica' });

    expect(baja.status).toBe('ok');        // 100 - 40 = 60 de holgura
    expect(critica.status).toBe('ok');     // 100 - 70 = 30 de holgura
    expect(critica.effectiveLeadDays).toBe(40 + SAFETY_DAYS.critica);
    expect(critica.slackDays!).toBeLessThan(baja.slackDays!);
  });

  it('lo importado suma aduana al plazo', () => {
    const nacional = evaluatePart({
      usageCounter: 0, expectedLifeUsage: 1_000, usagePerDay: 10,
      leadTimeDays: 30, criticality: 'media', isImported: false,
    });
    const importado = evaluatePart({
      usageCounter: 0, expectedLifeUsage: 1_000, usagePerDay: 10,
      leadTimeDays: 30, criticality: 'media', isImported: true,
    });
    expect(importado.effectiveLeadDays! - nacional.effectiveLeadDays!).toBe(IMPORT_BUFFER_DAYS);
  });

  it('sin lead time registrado asume un plazo por defecto en vez de cero', () => {
    const r = evaluatePart({
      usageCounter: 0, expectedLifeUsage: 100, usagePerDay: 1, criticality: 'baja',
    });
    expect(r.effectiveLeadDays).toBe(DEFAULT_LEAD_TIME_DAYS);
  });
});

describe('se niega a inventar lo que no sabe', () => {
  it('sin vida útil declarada devuelve sin_datos, no un porcentaje falso', () => {
    const r = evaluatePart({ usageCounter: 5_000_000, usagePerDay: 20_000 });
    expect(r.status).toBe('sin_datos');
    expect(r.lifeUsedPct).toBeNull();
    expect(r.daysRemaining).toBeNull();
  });

  it('sin ritmo conserva el porcentaje pero no arriesga una fecha', () => {
    const r = evaluatePart({
      usageCounter: 4_000_000,
      expectedLifeUsage: 8_000_000,
      usagePerDay: null,
    });
    expect(r.status).toBe('sin_datos');
    expect(r.lifeUsedPct).toBe(50);      // esto sí se sabe
    expect(r.daysRemaining).toBeNull();  // esto no
    expect(r.reason).toContain('sin lecturas');
  });

  it('un ritmo de cero no es un ritmo', () => {
    const r = evaluatePart({
      usageCounter: 0, expectedLifeUsage: 1_000, usagePerDay: 0,
    });
    expect(r.status).toBe('sin_datos');
  });
});

describe('vencida', () => {
  it('se declara vencida sin necesitar ritmo', () => {
    const r = evaluatePart({
      usageCounter: 9_000_000,
      lastReplacedUsage: 0,
      expectedLifeUsage: 8_000_000,
      usagePerDay: null,
    });
    expect(r.status).toBe('vencida');
    expect(r.remainingUsage).toBe(0);
    expect(r.lifeUsedPct).toBe(112.5);
  });

  it('un contador menor al último cambio no produce uso negativo', () => {
    // Pasa de verdad: se cambia el tablero y el contador vuelve a cero.
    const r = evaluatePart({
      usageCounter: 0,
      lastReplacedUsage: 10_000_000,
      expectedLifeUsage: 8_000_000,
      usagePerDay: 20_000,
    });
    expect(r.usageSinceReplacement).toBe(0);
    expect(r.status).toBe('ok');
  });
});

describe('suggestedMinStock — el plazo manda, no el precio', () => {
  it('una pieza de reposición lenta justifica más stock que una rápida', () => {
    const base = { usageCounter: 0, expectedLifeUsage: 1_000, usagePerDay: 10, criticality: 'media' as const };
    const rapida = suggestedMinStock({ ...base, leadTimeDays: 5 });
    const lenta  = suggestedMinStock({ ...base, leadTimeDays: 200 });
    expect(lenta!).toBeGreaterThan(rapida!);
  });

  it('multiplica por la cantidad instalada', () => {
    const una = suggestedMinStock({
      usageCounter: 0, expectedLifeUsage: 1_000, usagePerDay: 10,
      leadTimeDays: 200, quantityInstalled: 1,
    });
    const cuatro = suggestedMinStock({
      usageCounter: 0, expectedLifeUsage: 1_000, usagePerDay: 10,
      leadTimeDays: 200, quantityInstalled: 4,
    });
    expect(cuatro!).toBeGreaterThan(una!);
  });

  it('una pieza crítica nunca sugiere cero', () => {
    const r = suggestedMinStock({
      usageCounter: 0,
      expectedLifeUsage: 10_000_000, // dura años
      usagePerDay: 1,
      leadTimeDays: 1,
      criticality: 'critica',
    });
    expect(r).toBe(1);
  });

  it('sin ritmo no sugiere nada en vez de sugerir cero', () => {
    expect(suggestedMinStock({ usageCounter: 0, expectedLifeUsage: 1_000, usagePerDay: null })).toBeNull();
  });
});

describe('comparePartUrgency', () => {
  it('ordena por lo que primero detiene la máquina', () => {
    const mk = (o: Parameters<typeof evaluatePart>[0]) => evaluatePart(o);
    const lista = [
      mk({ usageCounter: 0, expectedLifeUsage: 1_000, usagePerDay: 1, leadTimeDays: 5, criticality: 'baja' }), // ok
      mk({ usageCounter: 2_000, expectedLifeUsage: 1_000 }),                                                   // vencida
      mk({ usageCounter: 900, expectedLifeUsage: 1_000, usagePerDay: 10, leadTimeDays: 60, criticality: 'baja' }), // atrasado
      mk({ usageCounter: 0, expectedLifeUsage: 100 }),                                                          // sin_datos
    ];
    const orden = [...lista].sort(comparePartUrgency).map((r) => r.status);
    expect(orden).toEqual(['vencida', 'atrasado', 'sin_datos', 'ok']);
  });
});
