'use client';

/**
 * The last boundary.
 *
 * `app/error.tsx` is rendered *inside* the root layout, so it cannot catch a
 * throw from the layout itself — and the layout is where every provider is
 * mounted (`QueryProvider`, `BrandProvider`, `AuthProvider`, `AppProviders`,
 * `KeyboardProvider`). Until now, a failure in any one of those fell through to
 * Next's built-in error page: unstyled, unbranded, and with no way back.
 *
 * `global-error.tsx` replaces the layout, so it has to supply its own `<html>`
 * and `<body>`. Every value here is an inline style rather than a Tailwind class
 * or a CSS custom property on purpose: if the failure was in the layout, the
 * stylesheet and the theme bootstrap are exactly the things that may not have
 * run, and an error screen that itself renders unstyled white-on-white is worse
 * than no error screen at all. The hexes are the design system's own —
 * #090A0C canvas, #16181D elevated surface, #282C35 border, #FF8C42 accent.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: '#090A0C',
          color: '#F5F5F5',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          role="alert"
          style={{
            width: '100%',
            maxWidth: '460px',
            borderRadius: '16px',
            border: '1px solid #282C35',
            backgroundColor: '#16181D',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            padding: '28px',
            textAlign: 'center',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="44"
            height="44"
            fill="none"
            stroke="#FF8C42"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ marginBottom: '16px' }}
          >
            <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9.4v4.2M12 17.1h.01" />
          </svg>

          <h1
            style={{
              margin: '0 0 8px',
              fontSize: '20px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            QuantMail couldn&apos;t start
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6, color: '#A1A4AC' }}>
            Something failed before the workspace could load. Reloading usually clears it.
          </p>

          {error.digest ? (
            <p
              style={{
                margin: '0 0 20px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '11px',
                color: '#6B6E76',
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: '44px',
                padding: '0 20px',
                borderRadius: '10px',
                border: '1px solid #E8752F',
                backgroundColor: '#FF8C42',
                color: '#090A0C',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '44px',
                padding: '0 20px',
                borderRadius: '10px',
                border: '1px solid #282C35',
                color: '#A1A4AC',
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Reload QuantMail
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
