"use client";

/**
 * The last boundary: the root layout itself failed, so there is no shell, no fonts and no
 * tokens to lean on. Plain, honest, and one way back.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#f7f5ef", color: "#14161c", fontFamily: "system-ui, sans-serif", margin: 0, padding: "48px 24px" }}>
        <main style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, letterSpacing: -0.6, margin: "0 0 12px" }}>Scrip could not render this page.</h1>
          <p style={{ color: "#5a5d66", lineHeight: 1.6, margin: "0 0 24px" }}>
            Nothing was sent and nothing was charged. Your register, your rule and every receipt are accounts on Solana; they are unaffected by whatever
            happened here.
          </p>
          <button type="button" onClick={reset} style={{ font: "inherit", padding: "10px 16px", borderRadius: 10, border: "1px solid #cdc5b4", background: "#2b4acb", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
          {error.digest ? <p style={{ marginTop: 24, color: "#8b8e97", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
