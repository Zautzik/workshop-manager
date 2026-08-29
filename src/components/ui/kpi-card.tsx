import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Una tarjeta de KPI, una sola vez.
 *
 * Inventario, Compras y Proveedores mostraban la misma idea —un número
 * grande con su etiqueta— con dos formas distintas: una con ícono y
 * Card/CardHeader, otra con un div y la etiqueta en mayúsculas. Ningún
 * módulo tiene una razón real para verse distinto del de al lado — es el
 * mismo "Operaciones" (auditoría 2026-08).
 */
export interface KpiCardProps {
	icon?: LucideIcon;
	label: string;
	value: string;
	hint?: string;
	/** Color del ícono, la etiqueta y el valor — semántico, no decorativo. */
	tone?: 'default' | 'primary' | 'warning' | 'critical' | 'success' | 'info';
	borderTone?: boolean;
	/** Contenido extra bajo el valor — para que la tarjeta no sea sólo un número flotando en espacio vacío. */
	children?: ReactNode;
}

const TONE_CLASSES: Record<NonNullable<KpiCardProps['tone']>, { text: string; border: string }> = {
	default: { text: 'text-foreground', border: 'border-border' },
	primary: { text: 'text-primary', border: 'border-primary/20' },
	warning: { text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
	critical: { text: 'text-destructive', border: 'border-destructive/30' },
	success: { text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
	info: { text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/30' },
};

export function KpiCard({ icon: Icon, label, value, hint, tone = 'default', borderTone = true, children }: KpiCardProps) {
	const cls = TONE_CLASSES[tone];
	return (
		<Card className={borderTone ? cls.border : undefined}>
			<CardHeader className="pb-2">
				<CardTitle className={`text-sm flex items-center gap-2 font-medium ${tone === 'default' ? 'text-muted-foreground' : cls.text}`}>
					{Icon && <Icon className="h-4 w-4" />}
					{label}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p className={`text-2xl font-bold ${tone === 'default' ? '' : cls.text}`}>{value}</p>
				{hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
				{children && <div className="mt-3">{children}</div>}
			</CardContent>
		</Card>
	);
}
