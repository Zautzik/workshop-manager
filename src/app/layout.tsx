/**
 * @fileoverview Root Layout Component
 * 
 * SYSTEM ROLE: HTML Document Root & Application Shell
 * ORGAN ANALOGY: The "Skeleton Frame" - Wraps the entire HTML document structure
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
