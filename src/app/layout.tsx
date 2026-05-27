/**
 * @fileoverview Root Layout Component
 * 
 * SYSTEM ROLE: HTML Document Root & Application Shell
 * 
 * This is the root layout that wraps ALL pages in the application. It:
 * - Sets up the basic HTML/body structure
 * - Imports global CSS styles (index.css containing Tailwind and theme variables)
 * - Wraps all pages with the Providers component for context/state management
 * - Sets metadata (title, description) that applies to the whole site
 * 
 * Every page in the app renders inside this layout's {children} placeholder.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Providers } from "./providers";
import "@/index.css";

export const metadata: Metadata = {
  title: "GonsAdmin",
  description: "Professional workshop operations platform for maintenance, workflow, HR, financial control, and production visibility.",
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the per-request nonce injected by src/middleware.ts.
  // Calling headers() here makes this layout dynamic so Next.js propagates
  // the nonce to the inline hydration <script> tags it generates.
  // If you add explicit <Script> components in future, pass nonce to them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const nonce = (await headers()).get('x-nonce') ?? '';

  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
