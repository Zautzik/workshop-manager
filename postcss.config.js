/**
 * @fileoverview PostCSS Configuration
 * 
 * SYSTEM ROLE: CSS Processing Pipeline
 * 
 * This configuration chains CSS processors:
 * - Tailwind CSS: Generates utility-first CSS from class names used in components
 * - Autoprefixer: Adds vendor prefixes (-webkit-, -moz-) for cross-browser compatibility
 * 
 * This ensures all CSS generated from Tailwind classes is properly processed and compatible
 * with all target browsers automatically.
 */
module.exports = {
	plugins: {
		// Tailwind CSS - Main styling engine, generates utility classes from config
		tailwindcss: {},
		
		// Autoprefixer - Automatically adds vendor prefixes for browser compatibility
		autoprefixer: {},
	},
};
