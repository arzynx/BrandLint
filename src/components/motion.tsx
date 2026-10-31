"use client";

import { useEffect, useRef } from "react";

/** Fades/slides children in when they scroll into view. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLElement>(null);
  const Comp = Tag as "div";
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Comp ref={ref as React.RefObject<HTMLDivElement>} className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      {children}
    </Comp>
  );
}

/** 3D tilt that follows the pointer, with a soft glare. */
export function Tilt({ children, className = "", max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  function move(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateY(-3px)`;
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
  }
  function leave() {
    if (ref.current) ref.current.style.transform = "";
  }
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={`tilt relative ${className}`}>
      {children}
      <span className="tilt-glare" aria-hidden />
    </div>
  );
}

/** Element drifts slightly toward the pointer. */
export function Magnetic({ children, strength = 0.25 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      className="inline-block transition-transform duration-200 ease-out"
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`;
      }}
      onPointerLeave={() => ref.current && (ref.current.style.transform = "")}
    >
      {children}
    </span>
  );
}

/** Soft moving colour behind the app. */
export function AppBackground() {
  return (
    <div className="app-bg" aria-hidden>
      <span className="blob" style={{ width: 520, height: 520, left: "-8%", top: "10%", background: "#7C5CFF" }} />
      <span className="blob" style={{ width: 460, height: 460, right: "-6%", top: "40%", background: "#5B3FE0", animationDelay: "-5s" }} />
      <span className="blob" style={{ width: 380, height: 380, left: "35%", bottom: "-10%", background: "#C6F432", animationDelay: "-9s" }} />
    </div>
  );
}

/** Animated ring gauge 0–100. */
export function ScoreGauge({ score, label, size = 112 }: { score: number; label: string; size?: number }) {
  const r = 42;
  const len = 2 * Math.PI * r;
  const color = score >= 85 ? "#1e7a46" : score >= 60 ? "#a15c07" : "#b42318";
  const verdict = score >= 85 ? "Ready" : score >= 60 ? "Needs work" : "High risk";
  return (
    <div className="flex items-center gap-3" data-cursor="help" title="Brand-safety score: 100 minus weighted open findings (high 15, medium 7, low 3). Decided findings no longer count.">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${label}: ${score} out of 100`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e9e6f7" strokeWidth="9" />
        <circle
          key={score}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - score / 100)}
          transform="rotate(-90 50 50)"
          style={{ "--len": len, animation: "ring-draw 1.1s cubic-bezier(0.2,0.7,0.2,1) both", transition: "stroke-dashoffset 0.6s ease, stroke 0.4s" } as React.CSSProperties}
        />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="700" fill="#1b1b1b">
          {score}
        </text>
      </svg>
      <div>
        <p className="eyebrow text-muted">{label}</p>
        <p className="text-lg font-bold" style={{ color }}>
          {verdict}
        </p>
      </div>
    </div>
  );
}

export function brandScore(findings: { id: string; severity: "high" | "medium" | "low" }[], decided: Record<string, unknown>): number {
  const w = { high: 15, medium: 7, low: 3 };
  const penalty = findings.filter((f) => !decided[f.id]).reduce((s, f) => s + w[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}
