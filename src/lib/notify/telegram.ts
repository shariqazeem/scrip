import "server-only";

import { eq } from "drizzle-orm";
import { resolveAsset } from "@/lib/assets/stand-in";
import { db } from "@/lib/db";
import { type receipts, telegramLinks } from "@/lib/db/schema";
import { bps, unitsFromRaw, usdc } from "@/lib/format";
import { siteUrl } from "@/lib/site";

/**
 * TELEGRAM — the arrival, as one message. "$200 landed. $20 became 0.0262 SPYx." Tapping it
 * opens the receipt. Configured by TELEGRAM_BOT_TOKEN (and TELEGRAM_BOT_USERNAME for the
 * link on the settings page); silent otherwise. Nothing here can spend.
 */
export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function newCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The link row for an owner, created with a fresh code if none exists. */
export async function linkFor(owner: string) {
  const [row] = await db.select().from(telegramLinks).where(eq(telegramLinks.owner, owner)).limit(1);
  if (row) return row;
  const code = newCode();
  await db.insert(telegramLinks).values({ owner, code }).onConflictDoNothing();
  const [fresh] = await db.select().from(telegramLinks).where(eq(telegramLinks.owner, owner)).limit(1);
  return fresh!;
}

export async function linkChat(code: string, chatId: string): Promise<string | null> {
  const [row] = await db.select().from(telegramLinks).where(eq(telegramLinks.code, code)).limit(1);
  if (!row) return null;
  await db.update(telegramLinks).set({ chatId, linkedAt: Math.floor(Date.now() / 1000) }).where(eq(telegramLinks.owner, row.owner));
  return row.owner;
}

export async function unlinkChat(chatId: string): Promise<void> {
  await db.update(telegramLinks).set({ chatId: "", linkedAt: 0 }).where(eq(telegramLinks.chatId, chatId));
}

export async function sendMessage(chatId: string, text: string, url?: string): Promise<boolean> {
  const token = botToken();
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false, ...(url ? { reply_markup: { inline_keyboard: [[{ text: "Open the receipt", url }]] } } : {}) }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** A receipt just landed in the cache: tell its recipient, if they linked a chat. */
export async function notifyReceipt(r: typeof receipts.$inferSelect): Promise<void> {
  if (!botToken()) return;
  const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.owner, r.recipient)).limit(1);
  if (!link || !link.chatId) return;
  const asset = await resolveAsset(r.asset);
  const units = asset ? `${unitsFromRaw(BigInt(r.amountRaw), asset.decimals)} ${asset.symbol}` : `${r.amountRaw} raw units`;
  const line =
    r.kind === "sweep"
      ? `${usdc(r.basisUsdc)} landed. ${bps(r.rateBps)} became ${units}.`
      : r.kind === "pay"
        ? `${usdc(r.paidUsdc)} paid to you${r.reason ? ` for “${r.reason}”` : ""}. It became ${units}.`
        : r.kind === "gift"
          ? `A first share: ${units}, claimed.`
          : r.kind === "grant"
            ? `A grant of ${units} is vesting to you${r.reason ? ` for “${r.reason}”` : ""}.`
            : `${units} vested to you.`;
  await sendMessage(link.chatId, line, `${siteUrl()}/receipt/${r.sig}`);
}
