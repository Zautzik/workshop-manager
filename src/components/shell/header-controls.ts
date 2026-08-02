/**
 * Shared geometry for every control in the app top bar.
 *
 * The bar previously mixed three different shapes — a bordered pill for search,
 * a full-width outline button for the snapshot action, and a bare icon for
 * notifications — so the right cluster read as three unrelated widgets. One
 * square 36×36 target for all of them is what makes the row scan as a set.
 *
 * Anything added to the bar should use this instead of restyling a Button.
 */
export const HEADER_ICON_BUTTON = [
	'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
	'text-muted-foreground transition-colors duration-150',
	'hover:bg-muted hover:text-foreground',
	'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
	'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
	'disabled:pointer-events-none disabled:opacity-50',
].join(' ');

/** Icon size inside a header control. Keeps stroke weight even across the row. */
export const HEADER_ICON = 'h-[18px] w-[18px]';
