/**
 * Breadcrumb trail derivation.
 *
 * The trail is computed from the URL plus lib/navigation, so a page never has
 * to declare its own crumbs and the trail cannot drift from the sidebar — the
 * same reason both surfaces already render from MODULES.
 *
 * Rendered by components/Breadcrumbs.tsx.
 */
import { HOME_ITEM, MODULES, findNavLeaf } from '@/lib/navigation';

export interface Crumb {
  label: string;
  /** Absent on the current page — the trail's last crumb is never a link. */
  href?: string;
}

/**
 * Labels for path segments that own no entry in lib/navigation (pages reached
 * from inside a section rather than from the sidebar). Without these the trail
 * would show raw URL slugs.
 */
const SEGMENT_LABELS: Record<string, string> = {
  home: 'Inicio',
  supervisor: 'Panel del Supervisor',
  supply: 'Abastecimiento',
  // personas
  empleados: 'Empleados',
  contratos: 'Contratos',
  nomina: 'Nómina',
  habilidades: 'Habilidades',
  capacitacion: 'Capacitación',
  certificaciones: 'Certificaciones',
  incentivos: 'Incentivos',
  licencias: 'Licencias',
  // equipos
  checklists: 'Checklists',
  programa: 'Programa',
  predictive: 'Predictivo',
  stats: 'Estadísticas',
  lectura: 'Lectura',
  // operaciones
  proveedores: 'Proveedores',
  operator: 'Operario',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Slug → readable label, with record ids collapsed to a short reference. */
export function labelForSegment(segment: string): string {
  const known = SEGMENT_LABELS[segment];
  if (known) return known;

  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    /* malformed escape in the URL — fall back to the raw segment */
  }

  if (UUID_RE.test(decoded)) return `#${decoded.slice(0, 8)}`;
  if (/^\d+$/.test(decoded)) return `#${decoded}`;

  // Word-initial, not \b: \b is ASCII-only, so it treats "ó" as a boundary and
  // would title-case "órdenes" into "óRdenes".
  return decoded
    .replace(/-/g, ' ')
    .replace(/(^|\s)(\p{L})/gu, (_, gap: string, initial: string) => gap + initial.toUpperCase());
}

/**
 * @param pathname   current route, e.g. '/personas/consola'
 * @param canSeeHome whether this role may open /home (vendedor and technician
 *                   may not, so their trail starts at their own module)
 */
export function buildCrumbs(pathname: string, canSeeHome: boolean): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];

  if (canSeeHome) crumbs.push({ label: HOME_ITEM.label, href: HOME_ITEM.href });

  // The module owning this route contributes one crumb for its whole prefix,
  // so /administracion reads as "Administración", not "Administracion".
  const parentModule = MODULES.find(
    (m) => pathname === m.href || pathname.startsWith(m.href + '/')
  );
  let index = 0;
  if (parentModule) {
    crumbs.push({ label: parentModule.label, href: parentModule.href });
    index = parentModule.href.split('/').filter(Boolean).length;
  }

  for (; index < segments.length; index++) {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const leaf = findNavLeaf(href);
    crumbs.push({ label: leaf?.label ?? labelForSegment(segments[index]), href });
  }

  // /home would otherwise yield Inicio twice (home crumb + its own segment).
  const trail = crumbs.filter((c, i) => i === 0 || c.href !== crumbs[i - 1].href);

  // You are already here — the current page is a label, not a link.
  const last = trail[trail.length - 1];
  if (last) trail[trail.length - 1] = { label: last.label };

  return trail;
}
