"use client";

import { useEffect, useState } from "react";

type Sev = "high" | "medium" | "low";

interface Issue {
  find: string;
  fix: string;
  sev: Sev;
  title: string;
  ref: string;
}

interface Example {
  id: string;
  tab: string;
  file: string;
  channel: string;
  text: string;
  issues: Issue[];
}

/**
 * Hero examples. Each one shows a different side of the product; every flag and
 * reference matches what the real engine reports for the Lumera Skin demo guideline.
 */
const EXAMPLES: Example[] = [
  {
    id: "creator",
    tab: "Creator post",
    file: "creator_post.txt",
    channel: "Instagram",
    text: "Obsessed with the LUMERA barrier cream 😍 72-hour hydration, no side effects, and my embarrassing dry patches are finally gone. Use my code PRIYA10",
    issues: [
      { find: "Obsessed", fix: "#ad Obsessed", sev: "high", title: "Paid post needs #ad up front", ref: "Guideline §6.1 · ASCI" },
      { find: "LUMERA", fix: "Lumera", sev: "medium", title: "Brand name written wrong", ref: "Guideline §3.2" },
      { find: "72-hour hydration", fix: "Deep hydration", sev: "high", title: "Claim still pending verification", ref: "Claim Registry C-05" },
      { find: "no side effects", fix: "gentle on skin", sev: "high", title: "Absolute promise", ref: "Guideline §4.4" },
      { find: "embarrassing dry patches", fix: "dry patches", sev: "high", title: "Shames skin", ref: "Guideline §2.3" },
    ],
  },
  {
    id: "email",
    tab: "Festive email",
    file: "diwali_newsletter.eml",
    channel: "Email",
    text: "Subject: LAST CHANCE! 30% off sitewide on our award-winning Glow Serum, loved by 5 lakh+ customers. Offer ends 15 Nov. Hurry!",
    issues: [
      { find: "LAST CHANCE!", fix: "Festive picks:", sev: "medium", title: "Pressure tactic in capitals", ref: "Guideline §2.4 · T-06" },
      { find: "30% off", fix: "20% off", sev: "high", title: "Discount contradicts the offer", ref: "Approved Facts F-04" },
      { find: "5 lakh+", fix: "2 lakh+", sev: "high", title: "Figure not backed by evidence", ref: "Claim Registry C-01" },
      { find: "15 Nov", fix: "10 Nov", sev: "high", title: "Offer actually ends 10 Nov", ref: "Approved Facts F-04" },
      { find: "Hurry!", fix: "Shop the range.", sev: "low", title: "No pressure tactics", ref: "Terminology T-06" },
    ],
  },
  {
    id: "web",
    tab: "Website banner",
    file: "homepage_hero.html",
    channel: "Website",
    text: "India's #1 fairness serum. Clinically proven, 100% guaranteed results. Glow Serum now ₹699. Click here to buy now.",
    issues: [
      { find: "#1", fix: "award-winning", sev: "high", title: "Ranking claim without evidence", ref: "Claim Registry C-04" },
      { find: "fairness", fix: "brightening", sev: "high", title: "Fairness language", ref: "Guideline §4.5" },
      { find: "Clinically proven", fix: "Dermatologically tested", sev: "high", title: "Efficacy claim needs evidence", ref: "Claim Registry C-03" },
      { find: "100% guaranteed results", fix: "gentle daily care", sev: "high", title: "Absolute promise", ref: "Guideline §4.4" },
      { find: "₹699", fix: "₹799", sev: "high", title: "Price contradicts the sheet", ref: "Approved Facts F-01" },
      { find: "Click here to buy now", fix: "Shop the Glow Serum", sev: "medium", title: "Link text says nothing", ref: "Guideline §7.2" },
    ],
  },
];

const POSITIONED = EXAMPLES.map((e) => ({ ...e, issues: e.issues.map((i) => ({ ...i, start: e.text.indexOf(i.find) })) }));

const SEV: Record<Sev, string> = { high: "bg-[#FF5D5D] text-white", medium: "bg-[#C6F432] text-[#0A0B14]", low: "bg-[#B9A8FF] text-[#0A0B14]" };
const WEIGHT: Record<Sev, number> = { high: 15, medium: 7, low: 3 };

type Phase = "typing" | "scan" | "flag" | "fix" | "done";

/** Where each phase starts on the 0..1 scroll timeline. */
const STAGES = { scan: 0.16, flag: 0.26, fix: 0.62, done: 0.9 };

/** The demo state at a point on the scroll timeline: same phases as the timed loop, scrubbed instead. */
function atProgress(p: number, textLength: number, k: number): { phase: Phase; n: number; flagged: number; fixed: number } {
  const span = (a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
  if (p < STAGES.scan) return { phase: "typing", n: Math.round(textLength * span(0, STAGES.scan * 0.9)), flagged: 0, fixed: 0 };
  if (p < STAGES.flag) return { phase: "scan", n: textLength, flagged: 0, fixed: 0 };
  if (p < STAGES.fix) return { phase: "flag", n: textLength, flagged: Math.ceil(k * span(STAGES.flag, STAGES.fix * 0.95)), fixed: 0 };
  if (p < STAGES.done) return { phase: "fix", n: textLength, flagged: k, fixed: Math.ceil(k * span(STAGES.fix, STAGES.done * 0.97)) };
  return { phase: "done", n: textLength, flagged: k, fixed: k };
}

function shuffled(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * With `progress` (0..1) the demo is driven by scroll and has no timers of its own.
 * Without it, it plays on a loop and moves to the next example after each run.
 * The examples are shuffled on every load; the tabs switch between them.
 */
export function LiveDemo({ progress }: { progress?: number } = {}) {
  // Rendered client-side only (Shell waits for mount), so a random order can't cause a hydration mismatch.
  const [order] = useState(() => shuffled(POSITIONED.length));
  const [slot, setSlot] = useState(0);
  const ex = POSITIONED[order[slot]];
  const k = ex.issues.length;

  const [timed, setPhase] = useState<Phase>("typing");
  const [tn, setN] = useState(0); // typed chars
  const [tFlagged, setFlagged] = useState(0);
  const [tFixed, setFixed] = useState(0);
  const scrubbed = progress != null ? atProgress(progress, ex.text.length, k) : null;
  const phase = scrubbed?.phase ?? timed;
  const n = scrubbed?.n ?? tn;
  const flagged = scrubbed?.flagged ?? tFlagged;
  const fixed = scrubbed?.fixed ?? tFixed;

  const restart = (next: number) => {
    setSlot(next);
    setN(0);
    setFlagged(0);
    setFixed(0);
    setPhase("typing");
  };

  useEffect(() => {
    if (scrubbed) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t: ReturnType<typeof setTimeout>;
    if (reduced) {
      t = setTimeout(() => {
        setN(ex.text.length);
        setFlagged(k);
        setPhase("flag");
      }, 0);
      return () => clearTimeout(t);
    }
    if (phase === "typing") {
      t = n < ex.text.length ? setTimeout(() => setN(n + 1), 20) : setTimeout(() => setPhase("scan"), 350);
    } else if (phase === "scan") {
      t = setTimeout(() => setPhase("flag"), 1300);
    } else if (phase === "flag") {
      t = flagged < k ? setTimeout(() => setFlagged(flagged + 1), 420) : setTimeout(() => setPhase("fix"), 1400);
    } else if (phase === "fix") {
      t = fixed < k ? setTimeout(() => setFixed(fixed + 1), 380) : setTimeout(() => setPhase("done"), 300);
    } else {
      t = setTimeout(() => restart((slot + 1) % POSITIONED.length), 3800);
    }
    return () => clearTimeout(t);
  }, [scrubbed, phase, n, flagged, fixed, k, ex.text.length, slot]);

  const open = flagged - fixed;
  const score = phase === "typing" || phase === "scan" ? null : Math.max(0, 100 - ex.issues.slice(fixed, flagged).reduce((s, i) => s + WEIGHT[i.sev], 0));

  // render text
  const parts: React.ReactNode[] = [];
  if (phase === "typing") {
    parts.push(
      <span key="t" className="caret">
        {ex.text.slice(0, n)}
      </span>,
    );
  } else {
    let pos = 0;
    ex.issues.forEach((iss, idx) => {
      parts.push(ex.text.slice(pos, iss.start));
      if (idx < fixed) parts.push(<span key={idx} className="demo-fixed">{iss.fix}</span>);
      else if (idx < flagged) parts.push(<span key={idx} className="demo-hl">{iss.find}</span>);
      else parts.push(iss.find);
      pos = iss.start + iss.find.length;
    });
    parts.push(ex.text.slice(pos));
  }

  const status =
    phase === "typing" ? "Drafting…" : phase === "scan" ? "Checking against guideline v4…" : phase === "flag" ? `${flagged} issue${flagged === 1 ? "" : "s"} found` : phase === "fix" ? "Applying approved fixes…" : "Ready to publish";

  return (
    <div className="glass relative overflow-hidden rounded-2xl p-5 shadow-2xl" aria-label="Animated demo of BrandLint checking content">
      {/* example tabs */}
      <div role="tablist" aria-label="Demo examples" className="mb-3 flex gap-1 rounded-xl bg-black/25 p-1">
        {order.map((i, s) => {
          const e = POSITIONED[i];
          const active = s === slot;
          return (
            <button
              key={e.id}
              role="tab"
              aria-selected={active}
              onClick={() => !active && restart(s)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" : "text-[#8E8AB8] hover:text-white"}`}
              style={active ? { background: "rgba(255,255,255,0.12)" } : undefined}
            >
              {e.tab}
            </button>
          );
        })}
      </div>

      {/* file bar */}
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="font-mono text-[#C9C5F0]">{ex.file}</span>
        <span className="rounded border border-white/15 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-[#8E8AB8]">{ex.channel}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 font-semibold text-[#C6F432]">
          {phase !== "done" && <span className="glow h-1.5 w-1.5 rounded-full bg-[#C6F432]" aria-hidden />}
          {status}
        </span>
      </div>

      {progress != null && (
        <div className="mb-3 h-0.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full origin-left rounded-full bg-[#C6F432]" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}

      <div className="relative h-[124px] overflow-hidden rounded-lg bg-[#05060d]/70 p-4 font-mono text-[15px] leading-7 text-[#EDEBFF]">
        {parts}
        {phase === "scan" && <span className="scanline" />}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <ul className="min-h-[188px] space-y-1.5">
          {ex.issues
            .slice(0, flagged)
            .map((iss, idx) => ({ iss, idx }))
            .slice(-4)
            .map(({ iss, idx }) => (
              <li key={`${ex.id}-${idx}`} className="fly-in flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs" style={{ background: "rgba(255,255,255,0.07)" }}>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${idx < fixed ? "bg-[#C6F432] text-[#0A0B14]" : SEV[iss.sev]}`}>{idx < fixed ? "fixed" : iss.sev}</span>
                <span className={`flex-1 ${idx < fixed ? "text-[#C6F432] line-through decoration-1" : "text-[#EDEBFF]"}`}>{iss.title}</span>
                <span className="hidden text-[#8E8AB8] sm:inline">{iss.ref}</span>
              </li>
            ))}
          {flagged === 0 && <li className="pt-6 text-center text-xs text-[#8E8AB8]">Every finding will quote the clause or approved fact it breaks.</li>}
        </ul>
        <div className="flex flex-col items-center justify-center rounded-lg bg-white/5 px-4 py-2">
          <svg width="92" height="92" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={score == null ? "transparent" : score >= 60 ? "#C6F432" : "#FF5D5D"}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - (score ?? 0) / 100)}
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.4s" }}
            />
            <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="700" fill="#EDEBFF">
              {score ?? "–"}
            </text>
          </svg>
          <span className="text-[11px] uppercase tracking-wide text-[#8E8AB8]">brand-safety</span>
          <span className="text-xs font-semibold text-[#C6F432]">{open > 0 ? `${open} open` : phase === "done" ? "✓ clean" : " "}</span>
        </div>
      </div>
    </div>
  );
}
