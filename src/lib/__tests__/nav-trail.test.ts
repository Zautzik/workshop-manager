import { describe, it, expect } from 'vitest';
import { findNavTrail, MODULES } from '../navigation';

describe('ubicar una ruta en el árbol de navegación', () => {
  it('la landing del módulo es el módulo, sin sección', () => {
    const t = findNavTrail('/administracion');
    expect(t?.module.label).toBe('Administración');
    expect(t?.leaf).toBeUndefined();
    expect(t?.rest).toEqual([]);
  });

  it('una sección resuelve su módulo y su etiqueta', () => {
    const t = findNavTrail('/administracion/settings');
    expect(t?.module.label).toBe('Administración');
    expect(t?.leaf?.label).toBe('Config. & APIs');
    expect(t?.rest).toEqual([]);
  });

  it('el grupo no forma parte de la ruta: no es una página', () => {
    // '¿Cuánto cuesta de verdad?' es un encabezado de la landing de Analítica.
    // Como paso del rastro sería texto muerto, imposible de pulsar.
    const t = findNavTrail('/analitica/maquinas');
    expect(t).not.toHaveProperty('group');
  });

  it('una ruta de detalle resuelve su sección y devuelve el resto', () => {
    const t = findNavTrail('/operaciones/kanban/OT-123');
    expect(t?.leaf?.label).toBe('Tablero');
    expect(t?.rest).toEqual(['OT-123']);
  });

  it('una página sin entrada en el menú conserva al menos su módulo', () => {
    const t = findNavTrail('/equipos/lectura/9f8e7d6c');
    expect(t?.module.label).toBe('Equipos');
    expect(t?.leaf).toBeUndefined();
    expect(t?.rest).toEqual(['lectura', '9f8e7d6c']);
  });

  it('una subruta cuelga de la sección que la contiene', () => {
    // El kiosko del técnico no es una entrada del menú: cuelga de WhatsApp.
    const t = findNavTrail('/operaciones/whatsapp/operator');
    expect(t?.leaf?.href).toBe('/operaciones/whatsapp');
    expect(t?.rest).toEqual(['operator']);
  });

  it('un prefijo parcial no cuenta como módulo', () => {
    // '/personast' no está dentro de '/personas'.
    expect(findNavTrail('/personast')).toBeUndefined();
  });

  it('fuera de los módulos no hay ruta que mostrar', () => {
    expect(findNavTrail('/home')).toBeUndefined();
    expect(findNavTrail('/login')).toBeUndefined();
  });

  it('la barra final no cambia el resultado', () => {
    expect(findNavTrail('/administracion/users/')?.leaf?.label).toBe('Usuarios');
  });

  it('toda sección declarada se puede ubicar', () => {
    for (const m of MODULES) {
      for (const g of m.groups) {
        for (const it of g.items) {
          // Las secciones que viven fuera del módulo (p. ej. /estacion) se
          // resuelven por su propia ruta, no por la del módulo que las lista.
          if (!it.href.startsWith(m.href + '/')) continue;
          expect(findNavTrail(it.href)?.leaf?.href, it.href).toBe(it.href);
        }
      }
    }
  });
});
