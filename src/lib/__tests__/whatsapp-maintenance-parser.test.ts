import { describe, expect, it } from 'vitest';
import { extractMaintenanceCode, classifyMaintenanceReply } from '../whatsapp-maintenance-parser';

describe('extractMaintenanceCode', () => {
  it('finds an 8-char hex code when the message also says "pauta"', () => {
    expect(extractMaintenanceCode('PAUTA A1B2C3D4 LISTO')).toBe('A1B2C3D4');
    expect(extractMaintenanceCode('pauta a1b2c3d4, ya quedó')).toBe('A1B2C3D4');
    expect(extractMaintenanceCode('el codigo de la pauta es deadbeef')).toBe('DEADBEEF');
  });

  it('returns null when the code is there but "pauta" is not -- code alone is not enough', () => {
    // Regression: v1 matched on the code alone, so any 8-digit number in a
    // normal production message (a date, an invoice number) misrouted into
    // this pipeline and swallowed the message instead of reaching production.
    expect(extractMaintenanceCode('LISTO A1B2C3D4')).toBeNull();
    expect(extractMaintenanceCode('factura 20260909 pagada')).toBeNull();
    expect(extractMaintenanceCode('vence el 20260909')).toBeNull();
  });

  it('returns null when there is no 8-char hex token, even with "pauta"', () => {
    expect(extractMaintenanceCode('fin ot 1234 hice 500 pliegos 3 de merma')).toBeNull();
    expect(extractMaintenanceCode('la pauta de hoy dice inicio ot 40965')).toBeNull();
  });

  it('does not match a run shorter or longer than 8 hex chars', () => {
    expect(extractMaintenanceCode('pauta codigo a1b2c3 corto')).toBeNull();
    expect(extractMaintenanceCode('pauta codigo a1b2c3d4e5 largo')).toBeNull();
  });
});

describe('classifyMaintenanceReply', () => {
  it('recognizes closing keywords', () => {
    expect(classifyMaintenanceReply('PAUTA A1B2C3D4 LISTO')).toBe('listo');
    expect(classifyMaintenanceReply('ya quedó terminada la pauta A1B2C3D4')).toBe('listo');
    expect(classifyMaintenanceReply('pauta A1B2C3D4 realizada')).toBe('listo');
  });

  it('treats anything else as a reported problem, not a close', () => {
    expect(classifyMaintenanceReply('no pude A1B2C3D4, falta repuesto')).toBe('problema');
    expect(classifyMaintenanceReply('la cuchilla esta mala A1B2C3D4')).toBe('problema');
  });

  it('"ok"/"okay" alone are not a close -- too common as a bare acknowledgment', () => {
    // "ok, ya voy a revisar" just means "got it, I'll look" -- not "it's fixed".
    expect(classifyMaintenanceReply('ok A1B2C3D4, ya voy a revisar')).toBe('problema');
    expect(classifyMaintenanceReply('okay reviso la pauta A1B2C3D4')).toBe('problema');
  });

  it('a negated closing word means the job is NOT done -- must not be read as "listo"', () => {
    // Regression: naive keyword matching found "listo" as a substring of
    // "no esta listo" and closed the order, exactly backwards from the
    // technician's actual message.
    expect(classifyMaintenanceReply('no esta listo, todavia falta el repuesto A1B2C3D4')).toBe('problema');
    expect(classifyMaintenanceReply('todavia no queda listo A1B2C3D4')).toBe('problema');
    expect(classifyMaintenanceReply('no pude dejarla lista A1B2C3D4')).toBe('problema');
    expect(classifyMaintenanceReply('nunca quedo terminada A1B2C3D4')).toBe('problema');
    expect(classifyMaintenanceReply('tampoco esta listo A1B2C3D4')).toBe('problema');
  });
});
