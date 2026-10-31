import { activeRule, claimSource, claimUsable, context, factSource, freshness, ruleSource } from "../knowledge";
import type { Audience, Brand, Channel, Claim, ContentContext, Finding, Rule, Segment } from "../types";
import { detectClaims } from "./claims";
import { findAll, matchCase, phraseRegex, sentences, uid } from "./util";

export interface CheckContext {
  brand: Brand;
  channel: Channel;
  audience?: Audience;
  region?: string;
  campaign?: string;
  today: string; // ISO date, injected so checks are reproducible
}

type Draft = Omit<Finding, "id" | "segmentId" | "origin" | "source" | "verdict"> & {
  source?: Finding["source"];
  verdict?: Finding["verdict"];
};

const content = (ctx: CheckContext): ContentContext =>
  context(ctx.channel, { audience: ctx.audience, region: ctx.region, campaign: ctx.campaign });

/** The rule, if it is approved, switched on and scoped to this content. */
function rule(ctx: CheckContext, id: string): Rule | undefined {
  return activeRule(ctx.brand, id, content(ctx));
}

function fromRule(ctx: CheckContext, r: Rule, d: Omit<Draft, "category" | "severity" | "title"> & Partial<Draft>): Draft {
  return {
    ruleId: r.id,
    category: r.category,
    severity: r.severity,
    title: r.title,
    source: ruleSource(r, ctx.brand.version),
    ...d,
  };
}

/** Claims the content may rely on here: verified, unexpired, and allowed in this context. */
function usableClaims(ctx: CheckContext): Claim[] {
  const cc = content(ctx);
  return ctx.brand.claims.filter((c) => claimUsable(c, cc, ctx.today).ok);
}

// ---------- terminology ----------
function checkTerminology(text: string, ctx: CheckContext): Draft[] {
  const out: Draft[] = [];
  ctx.brand.terms.forEach((t, i) => {
    for (const phrase of t.avoid) {
      for (const m of findAll(text, phraseRegex(phrase))) {
        if (out.some((o) => o.start! < m.end && o.end! > m.start)) continue;
        out.push({
          ruleId: t.id,
          category: "terminology",
          severity: t.severity,
          title: `Use "${t.prefer}"`,
          message: `"${m.text}" is on the avoid list. ${t.note}`,
          excerpt: m.text,
          start: m.start,
          end: m.end,
          source: {
            kind: "term",
            id: t.id,
            ref: `Terminology sheet, row ${i + 1} (${t.id})`,
            quote: `Avoid: ${t.avoid.join(", ")} → Prefer: ${t.prefer}`,
            version: ctx.brand.version,
          },
          confidence: phrase.includes(" ") ? 0.95 : 0.85,
          suggestion: matchCase(m.text, t.prefer),
          suggestionBy: "rule",
        });
      }
    }
  });
  return out;
}

// ---------- claims ----------
interface Fallback {
  text: string; // "" means "remove it"
  from?: Claim; // the registry claim the wording comes from
}

/** A substantiated phrase from the given claims matching `re`. */
function approvedPhrase(claims: Claim[], re: RegExp): Fallback | undefined {
  for (const c of claims) for (const p of c.supports) if (re.test(p)) return { text: p, from: c };
  return undefined;
}

const REMOVE: Fallback = { text: "" };

/**
 * Deterministic replacement for an unsupported claim, built only from approved
 * wording the content may use here. "" means "remove it". The AI layer may offer a better one.
 */
function claimFallback(label: string, hit: string, usable: Claim[], related?: Claim): Fallback | undefined {
  const rel = related ? [related] : [];
  switch (label) {
    case "ranking claim":
      return approvedPhrase(usable, /^award[- ]winning$/) ?? REMOVE;
    case "superlative":
    case "first-of-its-kind claim":
    case "absolute promise":
      if (/no\s+side[-\s]effects?/i.test(hit)) return { text: "gentle on skin" };
      return REMOVE;
    case "medical claim":
      return { text: "helps care for" };
    case "clinical claim": {
      // "Shown in our 2024 consumer study to reduce…" -> "shown in our 2024 consumer study"
      const lead = related?.wording.match(/^(.+?)\s+to\s+/i)?.[1];
      return lead ? { text: lead.charAt(0).toLowerCase() + lead.slice(1), from: related } : approvedPhrase(usable, /tested/) ?? REMOVE;
    }
    case "endorsement claim":
      return approvedPhrase(usable, /tested/) ?? REMOVE;
    case "time-bound result":
      return approvedPhrase(rel, /^within\s/i) ?? REMOVE;
    case "duration claim":
      return REMOVE;
    case "fairness language":
      if (/fair(?:er)?\s+(skin|complexion|tone)/i.test(hit)) return { text: hit.replace(/fair(?:er)?/i, "brighter-looking") };
      return { text: "brightening" };
  }
  return undefined;
}

/** "a" or "an" before a label. */
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/** §4.2 and §4.3 need evidence; without it a claim is unverified, not false. The other claim rules are outright bans. */
const EVIDENCE_RULES = new Set(["R-4.2", "R-4.3"]);

function checkClaims(text: string, ctx: CheckContext): Draft[] {
  const out: Draft[] = [];
  const cc = content(ctx);
  const usable = usableClaims(ctx);
  for (const h of detectClaims(text, ctx.brand)) {
    const status = h.supportedBy ? claimUsable(h.supportedBy, cc, ctx.today) : null;
    if (status?.ok) continue;
    const registered = h.supportedBy && status && !status.ok ? { claim: h.supportedBy, why: status.why } : null;
    const r = rule(ctx, h.ruleId);
    if (!r) continue;
    // Suggest the approved, substantiated wording when the sentence is about a registered claim.
    const sentence = sentences(text).find((s) => h.start >= s.start && h.start < s.end)?.text.toLowerCase() ?? "";
    const related = usable.find((c) => c.kind !== "statistic" && c.aliases.some((a) => sentence.includes(a.toLowerCase())));
    const fix = claimFallback(h.label, h.text, usable, related);
    // when removing, swallow one following space so the sentence stays clean
    const end = fix?.text === "" && text[h.end] === " " ? h.end + 1 : h.end;
    // Evidence is the record the content was compared with: the matched registry entry, or the one the fix is built from.
    const evidenceClaim = registered?.claim ?? fix?.from;
    out.push(
      fromRule(ctx, r, {
        verdict: registered || EVIDENCE_RULES.has(h.ruleId) ? "unverified" : "breach",
        message: registered
          ? `"${h.text}" matches ${registered.claim.id} in the Claim Registry, but ${registered.why}, so it can't be used as evidence here.`
          : EVIDENCE_RULES.has(h.ruleId)
            ? `"${h.text}" is ${article(h.label)} ${h.label}. There is no verified entry in the Claim Registry to support it. It may be true, but it can't be published until it is substantiated.`
            : `"${h.text}" is ${article(h.label)} ${h.label}, which the guideline doesn't allow regardless of evidence.`,
        excerpt: text.slice(h.start, end),
        start: h.start,
        end,
        evidence: evidenceClaim ? claimSource(evidenceClaim, ctx.brand.version) : undefined,
        suggestion: fix === undefined ? undefined : fix.text === "" ? "" : matchCase(h.text, fix.text),
        suggestionBy: fix === undefined ? undefined : "rule",
        confidence: h.ruleId === "R-4.2" && /^best$/i.test(h.text) ? 0.7 : 0.9,
        advice: related && h.ruleId === "R-4.3"
          ? `Use the approved wording instead: "${related.wording}" (${related.id}).`
          : registered
            ? `Remove the claim, or ask ${registered.claim.owner} to re-verify ${registered.claim.id}.`
            : "Remove the claim, or add it to the Claim Registry with evidence first.",
      }),
    );
  }
  return out;
}

// ---------- facts and statistics ----------
const MULT: Record<string, number> = {
  k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7,
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function formatCount(n: number): string {
  if (n >= 1e7) return `${n / 1e7} crore`;
  if (n >= 1e5) return `${n / 1e5} lakh`;
  return n.toLocaleString("en-IN");
}

function parseDate(day: string, mon: string, year: string | undefined, today: string): string | null {
  const mi = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
  if (mi < 0) return null;
  const y = year ? Number(year.length === 2 ? "20" + year : year) : Number(today.slice(0, 4));
  return `${y}-${String(mi + 1).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function checkFacts(text: string, ctx: CheckContext): Draft[] {
  const r = rule(ctx, "R-4.1");
  if (!r) return [];
  const out: Draft[] = [];
  const v = ctx.brand.version;

  for (const s of sentences(text)) {
    const lower = s.text.toLowerCase();
    // Where each priced product is mentioned, so a price is compared with the product it follows.
    const mentions = ctx.brand.facts
      .filter((f) => f.kind === "price")
      .flatMap((f) => f.aliases.flatMap((a) => findAll(lower, phraseRegex(a, "gi")).map((m) => ({ id: f.id, at: m.start }))));
    const ownerOf = (pos: number) =>
      mentions.filter((m) => m.at < pos).sort((a, b) => b.at - a.at)[0]?.id ?? [...mentions].sort((a, b) => a.at - b.at)[0]?.id;
    for (const f of ctx.brand.facts) {
      if (!f.aliases.some((a) => phraseRegex(a, "i").test(lower))) continue;
      const base = (d: Partial<Draft> & Pick<Draft, "message">): Draft =>
        fromRule(ctx, r, { title: `Doesn't match ${f.label}`, verdict: "contradicts", confidence: 0.9, evidence: factSource(f, v), ...d });

      if (f.kind === "price" && f.numeric != null) {
        for (const m of findAll(s.text, /(?:₹|\brs\.?|\binr)\s?(\d[\d,]*)(?:\s?\/-)?/gi)) {
          if (ownerOf(m.start) !== f.id) continue;
          const price = Number(m.groups[0].replace(/,/g, ""));
          const at = { excerpt: m.text, start: s.start + m.start, end: s.start + m.end };
          if (price !== f.numeric) {
            out.push(
              base({
                message: `Price ₹${price} doesn't match the approved price of ₹${f.numeric} (${f.id}).`,
                ...at,
                confidence: 0.95,
                suggestion: `₹${f.numeric}`,
                suggestionBy: "rule",
              }),
            );
          } else {
            const state = freshness(f, ctx.today);
            if (state === "review_overdue" || state === "expired") {
              out.push(
                base({
                  title: "Approved price is due for re-verification",
                  severity: "low",
                  verdict: "unverified",
                  message: `The price matches ${f.id}, but ${f.id} was due for re-verification on ${f.reviewBy ?? f.validUntil}, so the sheet itself may be out of date.`,
                  ...at,
                  confidence: 0.6,
                  advice: `Ask ${f.owner} to confirm the price before publishing.`,
                }),
              );
            }
          }
        }
      }

      if (f.kind === "offer" && f.numeric != null) {
        for (const m of findAll(s.text, /(\d{1,2})\s?%\s?(?:off|discount)/gi)) {
          if (Number(m.groups[0]) !== f.numeric) {
            out.push(
              base({
                message: `Discount of ${m.groups[0]}% doesn't match the approved offer (${f.numeric}% off, ${f.id}).`,
                excerpt: m.text,
                start: s.start + m.start,
                end: s.start + m.end,
                suggestion: m.text.replace(m.groups[0], String(f.numeric)),
                suggestionBy: "rule",
              }),
            );
          }
        }
        if (f.validUntil) {
          const dateRe =
            /(?:till|until|ends?|valid\s+(?:till|until|through)|through|by)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:,?\s+(\d{2,4}))?/gi;
          for (const m of findAll(s.text, dateRe)) {
            const iso = parseDate(m.groups[0], m.groups[1], m.groups[2], ctx.today);
            if (iso && iso > f.validUntil) {
              const d = new Date(f.validUntil + "T00:00:00");
              const approved = `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;
              out.push(
                base({
                  title: "Offer date is wrong",
                  message: `The offer ends on ${f.validUntil} (${f.id}), not ${iso}.`,
                  excerpt: m.text,
                  start: s.start + m.start,
                  end: s.start + m.end,
                  suggestion: m.text.replace(new RegExp(`${m.groups[0]}(?:st|nd|rd|th)?\\s+${m.groups[1]}`), approved),
                  suggestionBy: "rule",
                }),
              );
            }
          }
          if (ctx.today > f.validUntil && /%\s?off|offer|sale/i.test(s.text)) {
            out.push(
              base({
                title: "Offer has expired",
                message: `This offer expired on ${f.validUntil} (${f.id}).`,
                excerpt: s.text.trim(),
                start: s.start,
                end: s.start + s.text.trimEnd().length,
                advice: "Remove the offer or check the marketing calendar for the current one.",
              }),
            );
          }
        }
      }
    }
  }
  return out;
}

/** Statistics (customer counts etc.) are claims: compared with the registry figure, which is a floor. */
function checkStatistics(text: string, ctx: CheckContext): Draft[] {
  const r = rule(ctx, "R-4.2");
  if (!r) return [];
  const out: Draft[] = [];
  const cc = content(ctx);
  const re =
    /(\d[\d,]*(?:\.\d+)?)\s?(lakhs?|lac|crore|cr|million|mn|thousand|k|l|m)?\s?\+?\s+(?:happy\s+|satisfied\s+|loyal\s+|trusted\s+)?(?:customers|users|people|consumers)/gi;
  for (const s of sentences(text)) {
    const lower = s.text.toLowerCase();
    for (const c of ctx.brand.claims) {
      if (c.kind !== "statistic" || c.numeric == null) continue;
      if (!c.aliases.some((a) => phraseRegex(a, "i").test(lower))) continue;
      const usable = claimUsable(c, cc, ctx.today);
      for (const m of findAll(s.text, re)) {
        const value = Number(m.groups[0].replace(/,/g, "")) * (MULT[(m.groups[1] ?? "").toLowerCase()] ?? 1);
        const numEnd = m.text.search(/\s+(?:happy\s+|satisfied\s+|loyal\s+|trusted\s+)?(?:customers|users|people|consumers)/i);
        const numText = m.text.slice(0, numEnd);
        const at = { excerpt: numText, start: s.start + m.start, end: s.start + m.start + numText.length };
        if (value > c.numeric) {
          out.push(
            fromRule(ctx, r, {
              title: `Figure not supported by ${c.label}`,
              verdict: "unverified",
              message: `"${numText}" is higher than the verified figure in the Claim Registry (${formatCount(c.numeric)}+, ${c.id}). It may be true, but there is no approved evidence for it yet.`,
              ...at,
              evidence: claimSource(c, ctx.brand.version),
              confidence: 0.9,
              suggestion: `${formatCount(c.numeric)}+`,
              suggestionBy: "rule",
              advice: `Use the verified figure, or send the new number and its evidence to ${c.owner}.`,
            }),
          );
        } else if (!usable.ok) {
          out.push(
            fromRule(ctx, r, {
              title: `${c.label} can't be used here`,
              verdict: "unverified",
              message: `"${numText}" relies on ${c.id}, but ${usable.why}.`,
              ...at,
              evidence: claimSource(c, ctx.brand.version),
              confidence: 0.85,
              advice: `Remove the figure for this audience, or ask ${c.owner} to extend ${c.id}.`,
            }),
          );
        }
      }
    }
  }
  return out;
}

// ---------- messaging ----------
function checkMessaging(text: string, ctx: CheckContext): Draft[] {
  const { brand } = ctx;
  const out: Draft[] = [];
  const tag = rule(ctx, "R-3.1");
  if (tag) {
    for (const old of brand.retiredTaglines) {
      for (const m of findAll(text, phraseRegex(old))) {
        out.push(
          fromRule(ctx, tag, {
            message: `"${m.text}" is a retired tagline.`,
            excerpt: m.text,
            start: m.start,
            end: m.end,
            confidence: 0.97,
            suggestion: brand.tagline.replace(/\.$/, ""),
            suggestionBy: "rule",
          }),
        );
      }
    }
    const core = brand.tagline.replace(/[.,]/g, "").trim().split(/\s+/);
    if (core.length >= 2) {
      // words must be separated by whitespace (so #SkinExplained isn't read as the tagline)
      const loose = new RegExp("(?<![#\\w])" + core.join(",?\\s+") + "\\.?", "gi");
      for (const m of findAll(text, loose)) {
        if (m.text.replace(/\.$/, "") !== brand.tagline.replace(/\.$/, "")) {
          out.push(
            fromRule(ctx, tag, {
              severity: "low",
              title: "Tagline written differently",
              message: `The tagline is written as "${m.text}" instead of "${brand.tagline}".`,
              excerpt: m.text,
              start: m.start,
              end: m.end,
              confidence: 0.8,
              suggestion: brand.tagline,
              suggestionBy: "rule",
            }),
          );
        }
      }
    }
  }
  const nameRule = rule(ctx, "R-3.2");
  if (nameRule) {
    const bad = [
      { re: /\bLumera\s+(?:Skincare|Skin\s+Care|Cosmetics)\b/gi, fix: "Lumera Skin" },
      { re: /\bLUMERA\b/g, fix: "Lumera" },
    ];
    for (const b of bad) {
      for (const m of findAll(text, b.re)) {
        if (out.some((o) => o.start! < m.end && o.end! > m.start)) continue;
        out.push(
          fromRule(ctx, nameRule, {
            message: `Brand name written as "${m.text}".`,
            excerpt: m.text,
            start: m.start,
            end: m.end,
            confidence: 0.97,
            suggestion: b.fix,
            suggestionBy: "rule",
          }),
        );
      }
    }
  }
  return out;
}

// ---------- tone (fixed baseline) ----------
const AUDIENCE_NOUN: Record<Audience, string> = { customers: "customer", professionals: "professional", investors: "investor", press: "press" };
const CAPS_OK = new Set(["SPF", "UV", "UVA", "UVB", "PA", "AHA", "BHA", "PHA", "DIY", "INR", "ASCI", "FAQ", "OTP", "PDF", "LUMERA", "PM", "AM", "SKU", "GST", "MRP", "DM", "COD"]);
const EMOJI_LIMIT: Record<Channel, number> = { instagram: 3, email: 1, website: 0, print: 0 };

function checkTone(text: string, ctx: CheckContext): Draft[] {
  const out: Draft[] = [];
  const excl = rule(ctx, "R-2.2");
  if (excl) {
    const marks = findAll(text, /!+/g);
    const total = marks.reduce((n, m) => n + m.text.length, 0);
    if (total > 1) {
      const second = marks.length > 1 ? marks[1] : marks[0];
      out.push(
        fromRule(ctx, excl, {
          message: `${total} exclamation marks; the limit is one.`,
          excerpt: second.text,
          start: second.start,
          end: second.end,
          confidence: 0.99,
          suggestion: ".",
          suggestionBy: "rule",
          advice: "Keep one exclamation mark at most; end other sentences with a full stop.",
        }),
      );
    }
  }
  const shame = rule(ctx, "R-2.3");
  if (shame) {
    for (const m of findAll(text, /\b(?:ugly|embarrassing|gross|disgusting|bad\s+skin|problem\s+skin|flawed|flaws|imperfections?|hide\s+your)\b/gi)) {
      out.push(
        fromRule(ctx, shame, {
          message: `"${m.text}" describes skin negatively.`,
          excerpt: m.text,
          start: m.start,
          end: m.end,
          confidence: 0.85,
          advice: "Describe what the product does instead of what is wrong with the person.",
        }),
      );
    }
  }
  const caps = rule(ctx, "R-2.4");
  if (caps) {
    const words = findAll(text, /\b[A-Z]{3,}\b/g).filter((m) => !CAPS_OK.has(m.text));
    for (const m of words.slice(0, 4)) {
      out.push(
        fromRule(ctx, caps, {
          message: `"${m.text}" is written in capitals for emphasis.`,
          excerpt: m.text,
          start: m.start,
          end: m.end,
          confidence: 0.9,
          suggestion: m.text[0] + m.text.slice(1).toLowerCase(),
          suggestionBy: "rule",
        }),
      );
    }
  }
  const emo = rule(ctx, "R-2.5");
  if (emo) {
    const found = findAll(text, /\p{Extended_Pictographic}/gu);
    const limit = EMOJI_LIMIT[ctx.channel];
    if (found.length > limit) {
      const first = found[limit];
      out.push(
        fromRule(ctx, emo, {
          message: `${found.length} emoji found; ${ctx.channel} allows ${limit}.`,
          excerpt: first.text,
          start: first.start,
          end: first.end,
          confidence: 0.99,
          advice: limit === 0 ? `Remove emoji for ${ctx.channel}.` : `Keep at most ${limit} emoji.`,
        }),
      );
    }
  }
  // Audience-scoped: only enforced when the content is for investors or press.
  const formal = rule(ctx, "R-2.6");
  if (formal) {
    const audience = content(ctx).audience;
    const first = [findAll(text, /\p{Extended_Pictographic}/gu)[0], findAll(text, /!+/g)[0]].filter(Boolean);
    for (const m of first) {
      if (out.some((o) => o.start! < m.end && o.end! > m.start)) continue;
      out.push(
        fromRule(ctx, formal, {
          message: `${m.text.startsWith("!") ? "Exclamation marks are" : "Emoji are"} not used in ${AUDIENCE_NOUN[audience]} communication.`,
          excerpt: m.text,
          start: m.start,
          end: m.end,
          confidence: 0.95,
          advice: "Remove it and state the point plainly.",
        }),
      );
    }
  }
  return out;
}

// ---------- accessibility ----------
const WORDS = (
  "skin explained care glow serum routine sun screen sunscreen day night lumera festive sale diwali self love beauty healthy " +
  "clean barrier repair cream tips my your daily spf vitamin dark spots summer winter edit award glowing morning mood " +
  "selfcare skincare tested real results new launch week dermat sensitive hydration hydrate gentle india indian"
)
  .split(" ")
  .sort((a, b) => b.length - a.length);

function camelCase(tag: string): string | null {
  const parts: string[] = [];
  let rest = tag;
  while (rest) {
    const w = WORDS.find((x) => rest.startsWith(x));
    if (!w) return null;
    parts.push(w[0].toUpperCase() + w.slice(1));
    rest = rest.slice(w.length);
  }
  return parts.length > 1 ? parts.join("") : null;
}

function checkAccessibility(text: string, ctx: CheckContext): Draft[] {
  const out: Draft[] = [];
  const tags = rule(ctx, "R-7.1");
  if (tags) {
    for (const m of findAll(text, /#([a-z][a-z0-9]{7,})\b/g)) {
      const cc = camelCase(m.groups[0]);
      out.push(
        fromRule(ctx, tags, {
          message: `"${m.text}" is hard for screen readers to read as separate words.`,
          excerpt: m.text,
          start: m.start,
          end: m.end,
          confidence: cc ? 0.9 : 0.6,
          suggestion: cc ? `#${cc}` : undefined,
          suggestionBy: cc ? "rule" : undefined,
          advice: cc ? undefined : "Capitalise each word in the hashtag.",
        }),
      );
    }
  }
  const links = rule(ctx, "R-7.2");
  if (links) {
    for (const m of findAll(text, /\b(?:click\s+here|click\s+this\s+link|link\s+here|tap\s+here)\b/gi)) {
      out.push(
        fromRule(ctx, links, {
          message: `"${m.text}" doesn't say where the link goes.`,
          excerpt: m.text,
          start: m.start,
          end: m.end,
          confidence: 0.95,
          advice: 'Name the destination, e.g. "see the full routine" or "shop the Glow Serum".',
        }),
      );
    }
  }
  return out;
}

// ---------- influencer disclosure (ASCI) ----------
function checkDisclosure(text: string, ctx: CheckContext): Draft[] {
  const r = rule(ctx, "R-6.1");
  if (!r) return [];
  const trigger = findAll(text, /\b(?:use\s+my\s+code|use\s+code|my\s+code|discount\s+code|gifted\s+by|was\s+gifted|paid\s+partnership|in\s+collaboration\s+with)\b/gi)[0];
  if (!trigger) return [];
  const firstLine = text.trim().split(/\n/)[0] ?? "";
  const disclosed = /#(?:ad|collab|sponsored|paidpartnership|partnership)\b/i.test(firstLine);
  if (disclosed) return [];
  const anywhere = /#(?:ad|collab|sponsored|paidpartnership|partnership)\b/i.test(text);
  return [
    fromRule(ctx, r, {
      message: anywhere
        ? "A partnership tag is present but not in the first line, where ASCI requires it to be visible."
        : `"${trigger.text}" indicates a paid or gifted post, but there is no #ad or #collab.`,
      excerpt: trigger.text,
      start: trigger.start,
      end: trigger.end,
      confidence: 0.85,
      advice: "Start the post with #ad or #collab.",
    }),
  ];
}

const CHECKS = [checkClaims, checkDisclosure, checkFacts, checkStatistics, checkMessaging, checkTerminology, checkTone, checkAccessibility];

/** Deterministic, rule-based checks. Same input + same guideline version + same context => same findings. */
export function runRuleChecks(segment: Segment, ctx: CheckContext): Finding[] {
  const drafts = CHECKS.flatMap((c) => c(segment.text, ctx));
  return drafts
    .map((d) => ({
      ...d,
      verdict: d.verdict ?? ("breach" as const),
      source: d.source!,
      id: uid("f"),
      segmentId: segment.id,
      origin: "rule" as const,
    }))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}
