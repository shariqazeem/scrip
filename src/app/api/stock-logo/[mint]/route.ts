import { type LogoSource, logoSource } from "@/lib/save/logo";
import { unframe } from "@/lib/save/unframe";

export const runtime = "nodejs";

/**
 * A STOCK'S LOGO, SERVED FROM SCRIP.WORK: the issuer's own image for the token, fetched once,
 * with xStocks' frame painted out, squared to 128 px and kept in memory. A page never asks a
 * third party for an image, so a visitor's address goes nowhere else, and never shows a broken
 * one: when the image cannot be had, the first letter of the stock's name stands in, for ten
 * minutes, and the next request tries again.
 */
const SIZE = 128;
const HOLD_MS = 24 * 3600 * 1000;
const MAX_BYTES = 2_000_000;

type Held = { readonly at: number; readonly body: Uint8Array };
const g = globalThis as typeof globalThis & {
  __scripLogos?: Map<string, Held>;
  __scripLogosInFlight?: Map<string, Promise<Uint8Array | null>>;
};
const held = (g.__scripLogos ??= new Map<string, Held>());
const inFlight = (g.__scripLogosInFlight ??= new Map<string, Promise<Uint8Array | null>>());

// The stand-in's colours, from src/styles/tokens.css: --border and --ink-muted.
const DISC = "#e4dfd3";
const LETTER = "#5a5d66";

export async function GET(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const src = logoSource(mint);
  // Not a stock Scrip offers (a devnet stand-in, say): a plain disc, never a broken image.
  if (!src) return standIn("");

  const hit = held.get(mint);
  if (hit && Date.now() - hit.at < HOLD_MS) return image(hit.body);

  let pending = inFlight.get(mint);
  if (!pending) {
    pending = draw(src)
      .catch(() => null)
      .finally(() => inFlight.delete(mint));
    inFlight.set(mint, pending);
  }
  const body = await pending;
  if (body) {
    held.set(mint, { at: Date.now(), body });
    return image(body);
  }
  // A logo held from before still beats a letter.
  return hit ? image(hit.body) : standIn(src.name);
}

async function draw(src: LogoSource): Promise<Uint8Array | null> {
  const res = await fetch(src.url, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;

  const sharp = (await import("sharp")).default;
  const meta = await sharp(buf).metadata();
  // A vector logo is drawn at its own size (Backpack's are 18 px) unless asked for more.
  const longest = Math.max(meta.width ?? SIZE, meta.height ?? SIZE, 1);
  const input = meta.format === "svg" ? sharp(buf, { density: Math.min(2400, Math.ceil((72 * SIZE * 2) / longest)) }) : sharp(buf);
  let img = input.ensureAlpha();
  if (src.frame === "xstocks") {
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    unframe(data, info.width, info.height);
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }
  const out = await img.resize(SIZE, SIZE, { fit: "cover" }).webp({ quality: 86 }).toBuffer();
  return new Uint8Array(out);
}

function image(body: Uint8Array): Response {
  return new Response(body as BodyInit, {
    headers: { "content-type": "image/webp", "cache-control": "public, max-age=604800, stale-while-revalidate=86400" },
  });
}

function standIn(name: string): Response {
  const first = (name.trim()[0] ?? "").toUpperCase();
  const letter = /^[A-Z0-9]$/.test(first)
    ? `<text x="64" y="64" dy=".35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="600" fill="${LETTER}">${first}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><circle cx="64" cy="64" r="64" fill="${DISC}"/>${letter}</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=600" } });
}
