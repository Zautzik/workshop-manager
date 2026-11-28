import { describe, expect, it } from 'vitest';
import { INBOX_ITEMS, inboxKeysFor } from '../inbox';
import { APP_ROLES } from '@/types/app-role';

describe('bandeja de Inicio por rol (auditoría M1)', () => {
  it('cada rol conocido tiene su lista, y sin rol no hay bandeja', () => {
    for (const role of APP_ROLES) expect(Array.isArray(inboxKeysFor(role))).toBe(true);
    expect(inboxKeysFor(null)).toEqual([]);
  });

  it('cada rol ve lo suyo', () => {
    expect(inboxKeysFor('vendedor')).toEqual(['late', 'signoff']);
    expect(inboxKeysFor('technician')).toEqual(['maintenance']);
    expect(inboxKeysFor('hr_manager')).toEqual(['leave']);
    expect(inboxKeysFor('admin')[0]).toBe('late'); // lo más urgente primero
  });

  it('las etiquetas concuerdan en número y cada ítem lleva a una pantalla', () => {
    expect(INBOX_ITEMS.late.label(1)).toBe('OT atrasada');
    expect(INBOX_ITEMS.late.label(3)).toBe('OT atrasadas');
    for (const def of Object.values(INBOX_ITEMS)) expect(def.href.startsWith('/')).toBe(true);
  });
});
