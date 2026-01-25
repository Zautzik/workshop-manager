/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	images: {
		domains: [],
	},
	// Disable static page generation for all pages since they use client-side auth
	output: 'standalone',
	// Explicitly set Turbopack root to this project to avoid detecting
	// unrelated lockfiles in parent folders (e.g. /Users/lauren/package-lock.json).
	turbopack: {
		root: __dirname,
	},
};

module.exports = nextConfig;
