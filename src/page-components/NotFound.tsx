/**
 * @fileoverview 404 Not Found Error Page Component
 * 
 * SYSTEM ROLE: Error Boundary / Invalid Route Handler
 * 
 * Displays when users try to access a route that doesn't exist:
 * - Shows friendly 404 error message
 * - Provides link back to home page
 * - Logs error details to console for debugging
 * - Responsive design centered on screen
 * 
 * Automatically rendered by Next.js when no matching route is found.
 */
'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from "react";
import Link from "next/link";

const NotFound = () => {
  const pathname = usePathname();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-gray-600">Oops! Page not found</p>
        <Link href="/" className="text-blue-500 underline hover:text-blue-700">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
