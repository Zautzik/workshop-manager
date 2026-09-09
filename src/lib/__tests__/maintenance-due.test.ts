import { describe, it, expect } from 'vitest';
import { evaluateSchedule, compareDue, advanceSchedule, decideCronOrderAction, WARNING_WINDOW_DAYS } from '../maintenance-due';

const HOY = new Date('2026-08-01T12:00:00Z');
const enDias = (d: number) => new Date(HOY.getTime() + d * 86_400_000).toISOString();

describe('vence lo que ocurra primero', () => {
  it('por calendario cuando la máquina casi no se usa', () => {
    // Parada: el aceite se degrada igual.
    const r = evaluateSchedule({
      nextMaintenanceDate: enDias(3),
      frequencyUsage: 100_000, lastMaintenanceUsage: 0, usageCounter: 5_000, usagePerDay: 100,
    }, { today: HOY });
    expect(r.driver).toBe('calendario');
    expect(r.status).toBe('proxima');
  });

  it('por uso cuando la máquina corre fuerte', () => {
    // 950 días de calendario, pero al ritmo actual el uso vence en 50.
    const r = evaluateSchedule({
      nextMaintenanceDate: enDias(950),
      frequencyUsage: 100_000, lastMaintenanceUsage: 0, usageCounter: 0, usagePerDay: 2_000,
    }, { today: HOY });
    expect(r.driver).toBe('uso');
    expect(r.daysByUsage).toBe(50);
    expect(r.daysUntilDue).toBe(50);
  });

  it('el más cercano gana, sin importar cuál sea', () => {
    const porUso = evaluateSchedule({
      nextMaintenanceDate: enDias(100), frequencyUsage: 1_000,
      lastMaintenanceUsage: 0, usageCounter: 0, usagePerDay: 100,
    }, { today: HOY });
    expect(porUso.driver).toBe('uso');       // 10 días vs 100

    const porCal = evaluateSchedule({
      nextMaintenanceDate: enDias(5), frequencyUsage: 1_000,
      lastMaintenanceUsage: 0, usageCounter: 0, usagePerDay: 100,
    }, { today: HOY });
    expect(porCal.driver).toBe('calendario'); // 5 días vs 10
  });
});

describe('vencidas', () => {
  it('detecta vencida por uso sin necesitar ritmo', () => {
    const r = evaluateSchedule({
      frequencyUsage: 8_000_000, lastMaintenanceUsage: 1_000_000, usageCounter: 9_500_000,
    }, { today: HOY });
    expect(r.status).toBe('vencida');
    expect(r.driver).toBe('uso');
    expect(r.reason).toContain('superó');
  });

  it('detecta vencida por calendario', () => {
    const r = evaluateSchedule({ nextMaintenanceDate: enDias(-20) }, { today: HOY });
    expect(r.status).toBe('vencida');
    expect(r.driver).toBe('calendario');
    expect(r.reason).toContain('20 días');
  });

  it('vencida por los dos: manda el que se pasó más', () => {
    const r = evaluateSchedule({
      nextMaintenanceDate: enDias(-5),
      frequencyUsage: 1_000, lastMaintenanceUsage: 0, usageCounter: 3_000, usagePerDay: 10,
    }, { today: HOY });
    expect(r.status).toBe('vencida');
    // -200 días por uso contra -5 por calendario.
    expect(r.driver).toBe('uso');
  });

  it('el uso no cuenta desde cero sino desde el último mantenimiento', () => {
    const r = evaluateSchedule({
      frequencyUsage: 5_000, lastMaintenanceUsage: 100_000, usageCounter: 102_000, usagePerDay: 100,
    }, { today: HOY });
    expect(r.usageRemaining).toBe(3_000);
    expect(r.status).not.toBe('vencida');
  });
});

describe('se niega a inventar', () => {
  it('sin fecha ni frecuencia de uso no dice nada', () => {
    const r = evaluateSchedule({}, { today: HOY });
    expect(r.status).toBe('sin_datos');
    expect(r.daysUntilDue).toBeNull();
  });

  it('con frecuencia de uso pero sin ritmo, dice cuánto falta y no cuándo', () => {
    const r = evaluateSchedule({
      frequencyUsage: 10_000, lastMaintenanceUsage: 0, usageCounter: 2_000, usagePerDay: null,
    }, { today: HOY });
    expect(r.status).toBe('sin_datos');
    expect(r.usageRemaining).toBe(8_000);   // esto sí se sabe
    expect(r.daysByUsage).toBeNull();       // esto no
    expect(r.reason).toContain('sin lecturas del contador');
  });
});

describe('ventana de aviso', () => {
  it('dentro de la ventana es próxima, fuera es al día', () => {
    expect(evaluateSchedule({ nextMaintenanceDate: enDias(WARNING_WINDOW_DAYS - 1) }, { today: HOY }).status).toBe('proxima');
    expect(evaluateSchedule({ nextMaintenanceDate: enDias(WARNING_WINDOW_DAYS + 10) }, { today: HOY }).status).toBe('al_dia');
  });
});

describe('orden de atención', () => {
  it('primero lo vencido, después lo próximo, y lo que falta datos antes que lo tranquilo', () => {
    const lista = [
      evaluateSchedule({ nextMaintenanceDate: enDias(60) }, { today: HOY }),   // al_dia
      evaluateSchedule({}, { today: HOY }),                                     // sin_datos
      evaluateSchedule({ nextMaintenanceDate: enDias(-3) }, { today: HOY }),   // vencida
      evaluateSchedule({ nextMaintenanceDate: enDias(2) }, { today: HOY }),    // proxima
    ];
    expect([...lista].sort(compareDue).map((r) => r.status))
      .toEqual(['vencida', 'proxima', 'sin_datos', 'al_dia']);
  });
});

describe('los dos programas del taller conviven', () => {
  it('la Ryobi se programa por impresiones', () => {
    const r = evaluateSchedule({
      frequencyUsage: 500_000, lastMaintenanceUsage: 8_000_000, usageCounter: 8_400_000,
      usagePerDay: 20_000, nextMaintenanceDate: enDias(365),
    }, { today: HOY });
    expect(r.driver).toBe('uso');
    expect(r.daysByUsage).toBe(5);  // faltan 100.000 a 20.000/día
    expect(r.status).toBe('proxima');
  });

  it('la Roland se programa por horas, con la misma función', () => {
    const r = evaluateSchedule({
      frequencyUsage: 500, lastMaintenanceUsage: 4_000, usageCounter: 4_450,
      usagePerDay: 6, nextMaintenanceDate: enDias(365),
    }, { today: HOY });
    expect(r.driver).toBe('uso');
    expect(r.daysByUsage).toBe(8);  // faltan 50 h a 6 h/día
  });
});

describe('completar una orden avanza el reloj de su pauta', () => {
  it('cuenta desde hoy, no desde el vencimiento anterior', () => {
    // Vencía hace dos semanas; se completa hoy con frecuencia de 30 días.
    const r = advanceSchedule({ frequencyDays: 30, completedAt: HOY });
    expect(r.last_maintenance_date).toBe(HOY.toISOString());
    expect(r.next_maintenance_date).toBe(enDias(30));
  });

  it('registra la lectura del contador cuando hay una', () => {
    const r = advanceSchedule({ frequencyDays: 30, completedAt: HOY, usageAtCompletion: 8_400_000 });
    expect(r.last_maintenance_usage).toBe(8_400_000);
  });

  it('no manda last_maintenance_usage cuando la máquina no tiene lectura -- un update parcial no debe borrar el último dato real', () => {
    const r = advanceSchedule({ frequencyDays: 30, completedAt: HOY });
    expect('last_maintenance_usage' in r).toBe(false);
  });

  it('null cuenta igual que ausente: tampoco se manda', () => {
    const r = advanceSchedule({ frequencyDays: 30, completedAt: HOY, usageAtCompletion: null });
    expect('last_maintenance_usage' in r).toBe(false);
  });
});

describe('el cron de pautas vencidas decide crear, reintentar el aviso, o no hacer nada', () => {
  it('sin orden todavía: crear', () => {
    expect(decideCronOrderAction(null)).toBe('create');
  });

  it('orden existente ya avisada: no hacer nada', () => {
    expect(decideCronOrderAction({ id: 'o1', notified_at: '2026-08-01T00:00:00Z' })).toBe('skip');
  });

  it('orden existente SIN avisar (el intento anterior falló a mitad de camino): reintentar el aviso, no crear otra', () => {
    // Regresión: antes "ya existe la orden" y "ya se avisó" eran el mismo
    // chequeo, así que un fallo de red durante notifyScheduleDue perdía el
    // aviso para siempre -- ninguna corrida futura lo reintentaba.
    expect(decideCronOrderAction({ id: 'o1', notified_at: null })).toBe('retry_notify');
  });
});
