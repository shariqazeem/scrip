import type { NextRequest } from "next/server";
import { refreshReceipts } from "@/lib/book/live";
import { tapeSince } from "@/lib/floor";

export const dynamic = "force-dynamic";

/**
 * THE TAPE, OVER SERVER-SENT EVENTS. Every three seconds the cache is asked for receipts it
 * learned about since the last look, and each is sent as one event. The cache itself is
 * refreshed from the chain on the same throttle every live surface shares, so a crowd on the
 * floor costs the RPC nothing extra. A heartbeat keeps proxies from closing the stream.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let since = Math.floor(Date.now() / 1000);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("hello", { at: since });
      let ticks = 0;
      const timer = setInterval(async () => {
        try {
          ticks += 1;
          if (ticks % 2 === 0) await refreshReceipts();
          const rows = await tapeSince(since);
          for (const r of rows) {
            send("receipt", r);
            since = Math.max(since, r.createdAt);
          }
          if (ticks % 5 === 0) controller.enqueue(encoder.encode(`: tick ${Date.now()}\n\n`));
        } catch {
          // A missed tick is not worth closing the stream over.
        }
      }, 3_000);
      const close = () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
