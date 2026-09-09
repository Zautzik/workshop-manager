import { describe, expect, it } from 'vitest';
import { extractMaintenanceCode, classifyMaintenanceReply } from '../whatsapp-maintenance-parser';

describe('extractMaintenanceCode', () => {
  it('finds an 8-char hex code anywhere in the message', () => {
    expect(extractMaintenanceCode('LISTO A1B2C3D4')).toBe('A1B2C3D4');
    expect(extractMaintenanceCode('listo a1b2c3d4, ya quedó')).toBe('A1B2C3D4');
    expect(extractMaintenanceCode('el codigo es deadbeef')).toBe('DEADBEEF');
  });

  it('returns null when there is no 8-char hex token', () => {
    // A normal production message never happens to contain one of these.
    expect(extractMaintenanceCode('fin ot 1234 hice 500 pliegos 3 de merma')).toBeNull();
    expect(extractMaintenanceCode('inicio ot 40965')).toBeNull();
  });

  it('does not match a run shorter or longer than 8 hex chars', () => {
    expect(extractMaintenanceCode('codigo a1b2c3 corto')).toBeNull();
    expect(extractMaintenanceCode('codigo a1b2c3d4e5 largo')).toBeNull();
  });
});

describe('classifyMaintenanceReply', () => {
  it('recognizes closing keywords', () => {
    expect(classifyMaintenanceReply('LISTO A1B2C3D4')).toBe('listo');
    expect(classifyMaintenanceReply('ya quedó terminada la pauta A1B2C3D4')).toBe('listo');
    expect(classifyMaintenanceReply('ok A1B2C3D4')).toBe('listo');
  });

  it('treats anything else as a reported problem, not a close', () => {
    expect(classifyMaintenanceReply('no pude A1B2C3D4, falta repuesto')).toBe('problema');
    expect(classifyMaintenanceReply('la cuchilla esta mala A1B2C3D4')).toBe('problema');
  });
});
