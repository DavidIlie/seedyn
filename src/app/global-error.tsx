"use client";

/**
 * The last boundary: it replaces the root layout, so the global stylesheet, the
 * fonts, and the theme class are all absent. Everything here is inline and
 * follows the operating system's colour scheme through `color-scheme` and the
 * `light-dark()` function, because there is no token layer left to inherit.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          colorScheme: "light dark",
          background: "light-dark(#fbfcfd, #101317)",
          color: "light-dark(#1b1f24, #f2f4f6)",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1rem",
        }}
      >
        <title>Seedyn</title>
        <main
          style={{
            maxWidth: "28rem",
            border: "1px solid light-dark(#dbe0e5, #363c43)",
            borderRadius: "0.375rem",
            padding: "1.5rem",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", margin: 0 }}>
            Seedyn failed to start
          </h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
            The application shell itself could not render. Reloading is usually
            enough; if it is not, the reference below matches a server log
            entry.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: "inherit",
              fontSize: "0.875rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid light-dark(#dbe0e5, #363c43)",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
