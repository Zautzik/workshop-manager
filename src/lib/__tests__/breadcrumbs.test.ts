import { describe, it, expect } from 'vitest';
import { buildCrumbs, labelForSegment } from '@/lib/breadcrumbs';

const labels = (path: string, canSeeHome = true) =>
  buildCrumbs(path, canSeeHome).map((c) => c.label);

describe('buildCrumbs', () => {
  it('trails home → module → section using navigation labels', () => {
    expect(labels('/personas/consola')).toEqual([
      'Inicio', 'Personas', 'Consola Operativa',
    ]);
    expect(labels('/equipos/mecanica')).toEqual([
      'Inicio', 'Equipos', 'Mecánica & Repuestos',
    ]);
  });

  it('stops at the module on its own landing page', () => {
    expect(labels('/analitica')).toEqual(['Inicio', 'Analítica']);
  });

  it('never links the current page', () => {
    const trail = buildCrumbs('/personas/consola', true);
    expect(trail.slice(0, -1).every((c) => !!c.href)).toBe(true);
    expect(trail[trail.length - 1].href).toBeUndefined();
  });

  it('links every ancestor back to its own route', () => {
    expect(buildCrumbs('/administracion/users', true).map((c) => c.href)).toEqual([
      '/home', '/administracion', undefined,
    ]);
  });

  it('labels pages that have no sidebar entry', () => {
    expect(labels('/personas/empleados')).toEqual(['Inicio', 'Personas', 'Empleados']);
    expect(labels('/operaciones/proveedores')).toEqual([
      'Inicio', 'Operaciones', 'Proveedores',
    ]);
  });

  it('collapses record ids into a short reference', () => {
    expect(labels('/equipos/lectura/8f14e45f-ceea-467a-9c4b-1f2d3e4a5b6c')).toEqual([
      'Inicio', 'Equipos', 'Lectura', '#8f14e45f',
    ]);
    expect(labels('/equipos/maquinas/42')).toEqual([
      'Inicio', 'Equipos', 'Máquinas', '#42',
    ]);
  });

  it('does not repeat Inicio on the home page itself', () => {
    expect(labels('/home')).toEqual(['Inicio']);
    expect(buildCrumbs('/home', true)[0].href).toBeUndefined();
  });

  it('omits the home crumb for roles that cannot open /home', () => {
    expect(labels('/comercial/clientes', false)).toEqual(['Comercial', 'Clientes']);
  });

  it('handles routes outside any module', () => {
    expect(labels('/supervisor')).toEqual(['Inicio', 'Panel del Supervisor']);
  });
});

describe('labelForSegment', () => {
  it('title-cases slugs, keeping accents intact', () => {
    expect(labelForSegment('hoja-produccion')).toBe('Hoja Produccion');
    expect(labelForSegment('órdenes-en-proceso')).toBe('Órdenes En Proceso');
  });

  it('survives a malformed percent escape', () => {
    expect(labelForSegment('100%')).toBe('100%');
  });
});
