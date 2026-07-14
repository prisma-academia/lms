"use client";

import { useEffect } from "react";

const INK = "#191420";
const PAPER = "#faf1e4";
const RED = "#ff5a5f";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: PAPER,
          color: INK,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          role="alert"
          style={{
            width: "100%",
            maxWidth: 440,
            textAlign: "center",
            background: "#fff",
            border: `2px solid ${INK}`,
            borderRadius: 14,
            boxShadow: `6px 6px 0 ${INK}`,
            padding: 28,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: `2px solid ${INK}`,
              background: RED,
              fontSize: 24,
              fontWeight: 700,
            }}
            aria-hidden
          >
            !
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
            Application error
          </h1>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "#57534e" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest ? (
            <p style={{ marginTop: 4, fontSize: 12, color: "#a8a29e", fontFamily: "monospace" }}>
              ref {error.digest}
            </p>
          ) : null}
          <div
            style={{
              marginTop: 20,
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => window.history.back()}
              style={{
                padding: "9px 16px",
                borderRadius: 10,
                background: "#fff",
                color: INK,
                border: `2px solid ${INK}`,
                boxShadow: `2px 2px 0 ${INK}`,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={reset}
              style={{
                padding: "9px 16px",
                borderRadius: 10,
                background: INK,
                color: PAPER,
                border: `2px solid ${INK}`,
                boxShadow: `2px 2px 0 ${INK}`,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
