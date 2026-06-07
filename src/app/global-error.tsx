'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '2rem',
            fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          }}
        >
          <section style={{ maxWidth: 560, textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Ocurrio un error inesperado
            </h1>
            <p style={{ marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Registramos este problema automaticamente. Intenta recargar la seccion.
            </p>
            <button
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 10,
                padding: '0.6rem 1rem',
                background: '#111827',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
