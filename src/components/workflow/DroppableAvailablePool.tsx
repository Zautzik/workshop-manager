'use client';

import type { ReactNode } from 'react';

export function DroppableAvailablePool({
	id,
	children,
	className,
}: {
	id: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			id={id}
			className={`${className || ''} rounded-lg border-2 border-dashed border-border transition-all`}
		>
			{children}
		</div>
	);
}
