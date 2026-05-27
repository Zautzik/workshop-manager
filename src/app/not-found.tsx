/**
 * @fileoverview 404 Not Found Page
 * 
 * SYSTEM ROLE: Error Boundary / Fallback Page
 * 
 * This page is displayed when users navigate to a route that doesn't exist.
 * It provides a user-friendly error message and navigation back to valid pages.
 * 
 * Rendered automatically by Next.js when no matching route is found.
 */
'use client';

import NotFound from "@/page-components/NotFound";

export default function NotFoundPage() {
  return <NotFound />;
}
