/**
 * @fileoverview Theme Context — thin re-export of next-themes
 *
 * Provides backward-compatible useTheme() hook.
 * Wraps next-themes ThemeProvider with app defaults so existing code keeps working.
 */
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
export { useTheme } from 'next-themes';
import React, { ReactNode } from 'react';

/**
 * App-level theme provider wrapping next-themes.
 * - attribute="class" for Tailwind dark mode
 * - defaultTheme="light"
 * - enableSystem for OS-level preference detection
 * - storageKey matches previous localStorage key
 */
export const ThemeProvider: React.FC<{ children: ReactNode; nonce?: string }> = ({ children, nonce }) => {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="theme"
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
};
