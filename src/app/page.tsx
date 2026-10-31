"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LiveDemo } from "@/components/LiveDemo";
import { CountUp, toast } from "@/components/fx";
import { Magnetic, Reveal, Tilt } from "@/components/motion";
import { PEOPLE, ROLE_LABEL } from "@/lib/people";
import { log, setState, useStore } from "@/lib/store";
import { CLAIM_DATASET } from "@/lib/eval/claimsDataset";
import type { Role } from "@/lib/types";

const CAUGHT = [
  "India's #1",
  "clinically proven",
  "fairer skin",
  "₹699 (approved: ₹799)",
  "Glow beyond limits",
  "no side effects",
  "100% chemical-free",
  "use my code (no #ad)",
  "5 lakh+ customers",
  "valid till 15 Nov",
  "Click here",
  "#skinexplained",
  "contrast 2.4:1",
  "off-palette #C2185B",
  "dermatologist recommended",
  "LUMERA Skincare",
];

const PIPE = [
  { t: "Extract", d: "Text, PDF pages, OCR from images" },
  { t: "Rules", d: "Facts, claims, terms, tone, contrast, palette" },
  { t: "AI layer", d: "Tone and indirect claims, drafts fixes" },
  { t: "Guard", d: "No clause, no flag. Ungrounded AI output is dropped" },
  { t: "Human", d: "Accept, edit or dismiss. A reviewer signs off" },
];

/**
 * Scroll progress (0..1) through a pinned section: 0 when the pin starts, 1 when it releases.
 * Only on wide screens, where the hero fits the viewport; undefined elsewhere (the demo then plays on its own).
 */
function usePinProgress(wrapper: React.RefObject<HTMLDivElement | null>, pinned: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState<number | undefined>(undefined);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    let raf = 0;
    const measure = () => {
      raf = 0;
      const w = wrapper.current, p = pinned.current;
      if (!w || !p || !wide.matches) return setProgress(undefined);
      const travel = w.offsetHeight - p.offsetHeight;
      const top = w.getBoundingClientRect().top;
      setProgress(travel > 0 ? Math.min(1, Math.max(0, -top / travel)) : 1);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    wide.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      wide.removeEventListener("change", schedule);
    };
  }, [wrapper, pinned]);
  return progress;
}

export default function Home() {
  const pinWrap = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const progress = usePinProgress(pinWrap, hero);
  const rules = useStore((s) => s.brand.rules.filter((r) => r.enabled).length);
  const go = (r: Role) => {
    setState((s) => {
      s.role = r;
      log(s, "switched role", `now acting as ${ROLE_LABEL[r]}`);
    });
    toast(`Now acting as ${PEOPLE[r].name}, ${ROLE_LABEL[r]}`, { kind: "info" });
  };

  return (
    <div className="-mt-6">
      {/* ---------------- hero (pinned on desktop; scrolling runs the demo check) ---------------- */}
      <div ref={pinWrap} className="relative lg:h-[230vh]">
      <section ref={hero} className="hero-dark hero-pin relative left-1/2 w-screen -translate-x-1/2">
        <span className="blob" style={{ width: 460, height: 460, left: "-6%", top: "-20%", background: "#7C5CFF" }} />
        <span className="blob" style={{ width: 420, height: 420, right: "-4%", top: "10%", background: "#5B3FE0", animationDelay: "-4s" }} />
        <span className="blob" style={{ width: 360, height: 360, left: "40%", bottom: "-35%", background: "#C6F432", animationDelay: "-8s", opacity: 0.35 }} />
        <div className="hero-grid" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div className="page-enter">
            <span className="eyebrow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[#C9C5F0]">
              <span className="glow h-2 w-2 rounded-full bg-[#C6F432]" /> Pre-publish brand governance · {rules} live rules
            </span>
            <h1 className="mt-6 text-[52px] font-semibold leading-[0.96] tracking-[-0.045em] text-white md:text-[76px]">
              Catch it <span className="text-lime">before</span> it goes live.
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-[1.55] text-[#B9B5E0]">
              BrandLint checks posts, emails, PDFs and banners against <em>your</em> guideline, approved facts and terminology. Every finding quotes the rule it breaks. A human
              decides every fix.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Magnetic>
                <Link
                  href="/submit?sample=launch"
                  onClick={() => go("creator")}
                  className="inline-flex items-center gap-2 rounded-xl bg-lime px-6 py-3.5 text-base font-semibold text-night shadow-[0_10px_30px_-10px_rgba(198,244,50,0.7)] transition hover:bg-[#d4ff4a]"
                >
                  Try it in 60 seconds <span aria-hidden>→</span>
                </Link>
              </Magnetic>
              <Link href="/trust" className="rounded-xl border border-white/25 px-5 py-3.5 font-semibold text-[#EDEBFF] transition hover:bg-white/10">
                How it works
              </Link>
            </div>
            <p className="mt-4 text-xs text-[#8E8AB8]">No sign-up. A private demo workspace for a fictional skincare brand, stored only in your browser.</p>
            {progress != null && (
              <p
                className="mt-8 hidden items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-[#C9C5F0] transition-opacity duration-500 lg:flex"
                style={{ opacity: progress < 0.04 ? 1 : 0 }}
                aria-hidden
              >
                <span className="scroll-cue" /> Scroll to run the check
              </p>
            )}
          </div>
          <div className="page-enter" style={{ animationDelay: "150ms" }}>
            <LiveDemo progress={progress} />
          </div>
        </div>

        {/* marquee */}
        <div className="relative border-t border-white/10 bg-black/15 py-3" aria-label="Examples of issues BrandLint catches">
          <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
            <div className="marquee gap-3">
              {[...CAUGHT, ...CAUGHT].map((c, i) => (
                <span key={i} className="mx-1.5 inline-flex shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-sm text-[#EDEBFF]">
                  <span className="text-[#FF5D5D]">✕</span> {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* ---------------- stats ---------------- */}
      <section className="mx-auto mt-12 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [rules, "guideline rules checked", "each quoted verbatim"],
          [7, "check families", "facts · claims · terms · tone · messaging · accessibility · visual"],
          [CLAIM_DATASET.length, "labelled test sentences", "accuracy measured live"],
          [0, "auto-published posts", "a person decides, always"],
        ].map(([n, t, d], i) => (
          <Reveal key={t as string} delay={i * 90}>
            <div className="card lift h-full p-5">
              <p className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink tabular">
                <CountUp value={n as number} ms={1400} />
              </p>
              <p className="mt-1 font-semibold">{t as string}</p>
              <p className="text-sm text-muted">{d as string}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* ---------------- pipeline ---------------- */}
      <section className="mx-auto mt-16 max-w-7xl">
        <Reveal>
          <p className="eyebrow text-violet-deep">The pipeline</p>
          <h2 className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink md:text-[44px]">Rules first. Model second. Human last.</h2>
        </Reveal>
        <div className="relative mt-8">
          <div className="relative mb-4 hidden h-4 lg:block" aria-hidden>
            <svg className="absolute inset-0 h-4 w-full" preserveAspectRatio="none" viewBox="0 0 1000 16">
              <line x1="10" y1="8" x2="990" y2="8" stroke="#5B3FE0" strokeOpacity="0.5" strokeWidth="2" className="dash-line" />
            </svg>
            {[0, 0.85, 1.7].map((d) => (
              <span key={d} className="absolute h-3 w-3 rounded-full bg-coral shadow-[0_0_14px_#5B3FE0]" style={{ top: 2, animation: `flowx 2.6s linear ${d}s infinite` }} />
            ))}
            {[10, 30, 50, 70, 90].map((x) => (
              <span key={x} className="absolute top-1 h-2 w-2 -translate-x-1/2 rounded-full bg-teal" style={{ left: `${x}%` }} />
            ))}
          </div>
          <ol className="relative grid gap-4 lg:grid-cols-5">
            {PIPE.map((p, i) => (
              <Reveal as="li" key={p.t} delay={i * 120}>
                <div className="card lift relative h-full p-4 text-center">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-night font-mono text-base font-medium text-lime ring-4 ring-paper">{i + 1}</span>
                  <h3 className="mt-3 font-semibold">{p.t}</h3>
                  <p className="mt-1 text-sm text-muted">{p.d}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- roles ---------------- */}
      <section className="mx-auto mt-16 max-w-7xl">
        <Reveal>
          <p className="eyebrow text-violet-deep">Three people, one workflow</p>
          <h2 className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink md:text-[44px]">Step into each role</h2>
        </Reveal>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {(
            [
              ["creator", "/submit", "Check a sample post", "✍️"],
              ["reviewer", "/review", "Open the review queue", "🔍"],
              ["owner", "/insights", "See guideline gaps", "📊"],
            ] as [Role, string, string, string][]
          ).map(([r, href, cta, icon], i) => (
            <Reveal key={r} delay={i * 120}>
              <Tilt className="card h-full overflow-hidden p-6">
                <span className="text-3xl" aria-hidden>
                  {icon}
                </span>
                <p className="eyebrow mt-3 text-violet-deep">{ROLE_LABEL[r]}</p>
                <h3 className="mt-1.5 text-xl font-semibold tracking-[-0.025em]">
                  {PEOPLE[r].name}, {PEOPLE[r].title.toLowerCase()}
                </h3>
                <p className="mt-2 text-sm text-muted">{PEOPLE[r].blurb}</p>
                <Link href={href} onClick={() => go(r)} className="btn-primary mt-5">
                  {cta} →
                </Link>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- principles ---------------- */}
      <section className="mx-auto mt-16 grid max-w-7xl gap-5 md:grid-cols-3">
        {[
          ["No clause, no flag", "AI findings that don't cite a real guideline rule, or quote text that isn't in your content, are discarded automatically. You can see how many on every check."],
          ["Reproducible where it can be", "Prices, dates, claim words, terminology, contrast and palette are checked by deterministic code. Same input, same guideline version, same result."],
          ["Overrides fix the guideline", "When people keep dismissing a rule, BrandLint flags it as a guideline gap and helps the owner rewrite it. Content gets fixed now; the rulebook gets fixed over time."],
        ].map(([t, d], i) => (
          <Reveal key={t} delay={i * 120}>
            <div className="card lift h-full border-t-2 border-t-lime p-5">
              <h3 className="text-xl font-semibold tracking-[-0.025em] text-ink">{t}</h3>
              <p className="mt-2 text-sm text-ink/80">{d}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* ---------------- CTA ---------------- */}
      <Reveal className="mx-auto mt-16 max-w-7xl">
        <div className="hero-dark relative overflow-hidden rounded-2xl px-8 py-10 text-center">
          <span className="blob" style={{ width: 300, height: 300, left: "10%", top: "-50%", background: "#5B3FE0", opacity: 0.4 }} />
          <span className="blob" style={{ width: 300, height: 300, right: "8%", bottom: "-60%", background: "#7C5CFF", animationDelay: "-6s" }} />
          <div className="hero-grid" />
          <h2 className="relative text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] text-white md:text-[48px]">
            Ship content in <span className="text-lime">one pass</span>, not three.
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-[#C9C5F0]">Paste your own caption or try a planted sample. It takes under a minute.</p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-3">
            <Magnetic>
              <Link href="/submit" onClick={() => go("creator")} className="inline-flex rounded-xl bg-lime px-6 py-3 font-semibold text-night transition hover:bg-[#d4ff4a]">
                Run a check →
              </Link>
            </Magnetic>
            <Link href="/eval" className="rounded-xl border border-white/25 px-5 py-3 font-semibold transition hover:bg-white/10">
              See measured accuracy
            </Link>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
