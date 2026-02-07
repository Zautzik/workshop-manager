/**
 * @fileoverview Home Page (Root Route)
 * 
 * SYSTEM ROLE: Entry Point Page
 * ORGAN ANALOGY: The "Front Door" - First page users see when visiting the application
 * 
 * This is the landing page that displays when users visit "/" or are not authenticated.
 * It renders the Login component which allows users to authenticate with their credentials.
 * 
 * After successful authentication, users are redirected to their role-specific dashboard
 * (Admin, Supervisor, Manager, or Worker dashboard).
 */
'use client';

import Login from "@/page-components/Login";

export default function Home() {
  return <Login />;
}
