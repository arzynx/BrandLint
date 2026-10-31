"use client";

import { CountUp } from "./fx";

export interface HeroStat {
  label: string;
  value: number;
  suffix?: string;
  tone?: "lime" | "flag" | "violet" | "white";
}

const TONE: Record<NonNullable<HeroStat["tone"]>, string> = {
  lime: "text-lime",
  flag: "text-flag",
  violet: "text-[#B9A8FF]",
  white: "text-white",
};

/** Dark Electric Night page header used on every app page. */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  stats,
  actions,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  stats?: HeroStat[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="hero-dark relative left-1/2 -mt-6 mb-8 w-screen -translate-x-1/2">
      <span className="blob" style={{ width: 380, height: 380, left: "-6%", top: "-55%", background: "#7C5CFF", opacity: 0.45 }} />
      <span className="blob" style={{ width: 300, height: 300, right: "6%", bottom: "-70%", background: "#C6F432", opacity: 0.12, animationDelay: "-6s" }} />
      <div className="hero-grid" />
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-end gap-x-10 gap-y-6 px-4 py-10 md:py-12">
        <div className="page-enter min-w-0 flex-1 basis-[420px]">
          <p className="eyebrow flex items-center gap-2 text-lime">
            <span className="glow h-1.5 w-1.5 rounded-full bg-lime" aria-hidden />
            {eyebrow}
          </p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] text-white md:text-[52px]">{title}</h1>
          {subtitle && <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-[#B9B5E0]">{subtitle}</p>}
          {actions && <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {stats && stats.length > 0 && (
          <dl className="stagger grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4" style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, minmax(0, 1fr))` }}>
            {stats.map((s) => (
              <div key={s.label} className="glass min-w-[118px] rounded-xl px-4 py-3">
                <dd className={`text-[30px] font-semibold leading-none tracking-[-0.04em] tabular ${TONE[s.tone ?? "white"]}`}>
                  <CountUp value={s.value} format={(v) => `${Math.round(v)}${s.suffix ?? ""}`} />
                </dd>
                <dt className="eyebrow mt-2 text-[10.5px] text-[#A9A6C9]">{s.label}</dt>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </section>
  );
}

/** Button styles that read well on the dark hero. */
export const heroBtn = "inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-sm font-semibold text-night transition hover:bg-[#d4ff4a]";
export const heroBtnGhost = "inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10";
