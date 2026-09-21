import { type NextRequest, NextResponse } from "next/server";
import { botToken, linkChat, sendMessage, unlinkChat } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";

/**
 * THE BOT'S WEBHOOK. Telegram POSTs every update here (set once with setWebhook, with a
 * secret token this route checks). `/start <code>` links the chat to the register that
 * showed the code; `/stop` unlinks. Nothing else is answered.
 */
export async function POST(req: NextRequest) {
  if (!botToken()) return NextResponse.json({ ok: false }, { status: 503 });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  let update: { message?: { chat?: { id?: number | string }; text?: string } };
  try {
    update = (await req.json()) as typeof update;
  } catch {
    return NextResponse.json({ ok: true });
  }
  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  if (chatId === undefined) return NextResponse.json({ ok: true });
  const chat = String(chatId);
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1] ?? "";
    const owner = code ? await linkChat(code, chat) : null;
    await sendMessage(chat, owner ? "Linked. Every stub that prints for your register arrives here as one message. Send /stop to unlink." : "Open Settings in Scrip and press “Open in Telegram”; the link carries a one-time code.");
  } else if (text.startsWith("/stop")) {
    await unlinkChat(chat);
    await sendMessage(chat, "Unlinked. Nothing more arrives here.");
  }
  return NextResponse.json({ ok: true });
}
