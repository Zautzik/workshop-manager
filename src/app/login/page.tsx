/**
 * @fileoverview Login Route Page
 *
 * SYSTEM ROLE: Dedicated Login Entry Point
 *
 * This route exists because NextAuth is configured to use /login as the
 * sign-in page. It renders the shared Login component.
 */
'use client';

import Login from '@/page-components/Login';

export default function LoginPage() {
  return <Login />;
}
