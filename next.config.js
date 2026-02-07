/**
 * @fileoverview Next.js Configuration File
 * 
 * SYSTEM ROLE: Build & Runtime Configuration
 * ORGAN ANALOGY: The "Skeleton" - Provides structural configuration for the entire application
 * 
 * This file configures Next.js behavior for:
 * - React strict mode (development safety checks)
 * - Image optimization domains
 * - Standalone output for production deployment
 * - Turbopack bundler configuration for optimal build performance
 * 
 * When this file changes, the entire application build process is affected.
 * 
 * @type {import('next').NextConfig}
 */
const nextConfig = {
	// Enable React strict mode for development - catches unsafe lifecycle methods and side effects
	reactStrictMode: true,
	
	// Image optimization configuration - external domains allowed for next/image component
	images: {
		domains: [],
	},
	
	// Output as standalone for docker/production deployment - bundles all dependencies into .next/standalone
	output: 'standalone',
	
	// Configure Turbopack (fast bundler) root to this project to avoid parent folder lockfiles
	turbopack: {
		root: __dirname,
	},
};

module.exports = nextConfig;
