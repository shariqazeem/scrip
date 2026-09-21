import "server-only";

import { eq } from "drizzle-orm";
import { liveView } from "@/lib/book/live";
import type { LiveArrival, LiveView } from "@/lib/book/live-types";
import { type Milestone, isMilestoneId, milestonesFor } from "@/lib/book/milestones";
import { readHandle } from "@/lib/book/read-book";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { validateSlug } from "@/lib/handle";

export type Moment = { slug: string; view: LiveView; milestone: Milestone; arrival: LiveArrival | null };

function slugOf(at: string): string | null {
  const raw = decodeURIComponent(at);
  const bare = raw.startsWith("@") ? raw.slice(1) : raw;
  const v = validateSlug(bare);
  return v.ok ? v.value : null;
}

/**
 * The milestone, its register and the receipt that crossed it — or null when the handle is
 * nobody's, names an organisation, keeps its register private, or has not crossed this one.
 * A moment is only shareable because its register is public; the page never leaks a private
 * one, and the card renders the same nothing the page does.
 */
export async function loadMoment(at: string, id: string): Promise<Moment | null> {
  const slug = slugOf(at);
  if (!slug || !isMilestoneId(id)) return null;
  const h = await readHandle(slug);
  const owner = h.ok && h.value ? h.value.owner : null;
  if (!owner || (h.ok && h.value?.kind === "org")) return null;
  const [row] = await db.select({ published: books.published }).from(books).where(eq(books.owner, owner)).limit(1);
  if (!row || row.published !== 1) return null;
  const view = await liveView(owner, { refresh: false });
  if (!view.ok) return null;
  const milestone = milestonesFor(view.value).find((m) => m.id === id);
  if (!milestone) return null;
  return { slug, view: view.value, milestone, arrival: view.value.arrivals.find((a) => a.sig === milestone.sig) ?? null };
}
