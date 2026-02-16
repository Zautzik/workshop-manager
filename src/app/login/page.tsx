/**
 * @fileoverview Login Route Page
 *
 * SYSTEM ROLE: Dedicated Login Entry Point
 * ORGAN ANALOGY: The "Front Door" - Explicit login route for NextAuth pages
 *
 * This route exists because NextAuth is configured to use /login as the
 * sign-in page. It renders the shared Login component.
 */
'use client';

import Login from '@/page-components/Login';

export default function LoginPage() {
  return <Login />;
}
