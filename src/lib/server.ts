import "server-only";
import { context } from "./knowledge";
import type { Audience, Brand, Channel, ContentContext, Segment } from "./types";
import { AUDIENCES, CHANNELS } from "./types";

const hits = new Map<string, { n: number; reset: number }>();

/** Best-effort per-instance rate limit so a public demo link can't burn the AI quota. */
export function rateLimited(req: Request, limit = 40, windowMs = 60_000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n++;
  return h.n > limit;
}

export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function parseChannel(v: unknown): Channel | null {
  return CHANNELS.includes(v as Channel) ? (v as Channel) : null;
}

/** Channel plus optional audience / region / campaign. Unknown audiences fall back to the default. */
export function parseContext(v: unknown): ContentContext | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const channel = parseChannel(o.channel);
  if (!channel) return null;
  const str = (x: unknown) => (typeof x === "string" ? x.slice(0, 60) : undefined);
  return context(channel, {
    audience: AUDIENCES.includes(o.audience as Audience) ? (o.audience as Audience) : undefined,
    region: str(o.region),
    campaign: str(o.campaign),
  });
}

export function parseSegments(v: unknown): Segment[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 40) return null;
  const out: Segment[] = [];
  let total = 0;
  for (const s of v) {
    if (!s || typeof s.id !== "string" || typeof s.text !== "string") return null;
    total += s.text.length;
    out.push({ id: s.id.slice(0, 40), label: String(s.label ?? "Text").slice(0, 40), text: s.text });
  }
  return total > 60_000 ? null : out;
}

export function parseBrand(v: unknown): Brand | null {
  const b = v as Brand;
  if (!b || typeof b.name !== "string" || !Array.isArray(b.rules) || !Array.isArray(b.facts) || !Array.isArray(b.claims) || !Array.isArray(b.terms) || !Array.isArray(b.palette))
    return null;
  if (JSON.stringify(b).length > 200_000) return null;
  return b;
}
