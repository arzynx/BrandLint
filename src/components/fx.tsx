"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// ---------------- toasts ----------------
export type ToastKind = "success" | "info" | "warn" | "error";
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; run: () => void };
}
let toasts: ToastItem[] = [];
let nextId = 1;
const toastListeners = new Set<() => void>();
const emit = () => toastListeners.forEach((l) => l());

export function toast(text: string, opts: { kind?: ToastKind; action?: ToastItem["action"]; ms?: number } = {}) {
  const t: ToastItem = { id: nextId++, kind: opts.kind ?? "success", text, action: opts.action };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => dismissToast(t.id), opts.ms ?? (opts.action ? 6000 : 3200));
}
function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const ICON: Record<ToastKind, string> = { success: "✓", info: "i", warn: "!", error: "×" };
const TONE: Record<ToastKind, string> = {
  success: "bg-ok text-white",
  info: "bg-teal text-white",
  warn: "bg-medium text-white",
  error: "bg-high text-white",
};

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => (toastListeners.add(l), () => toastListeners.delete(l)),
    () => toasts,
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-lg" style={{ animation: "toast-in 0.3s cubic-bezier(0.2,0.7,0.2,1) both" }}>
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${TONE[t.kind]}`}>{ICON[t.kind]}</span>
          <span className="flex-1">{t.text}</span>
          {t.action && (
            <button
              className="font-semibold text-teal underline"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button aria-label="Dismiss notification" className="text-muted hover:text-ink" onClick={() => dismissToast(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------- switch ----------------
export function Switch({ checked, onChange, label, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; disabled?: boolean; hint?: React.ReactNode }) {
  return (
    <label className={`inline-flex items-center gap-2.5 text-sm ${disabled ? "opacity-60" : ""}`}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} className="switch" onClick={() => onChange(!checked)} />
      <span>
        {label}
        {hint && <span className="text-muted"> {hint}</span>}
      </span>
    </label>
  );
}

// ---------------- spinner ----------------
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`spinner ${className}`} aria-hidden />;
}

// ---------------- busy cursor ----------------
export function useBusyCursor(busy: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle("is-busy", busy);
    return () => document.documentElement.classList.remove("is-busy");
  }, [busy]);
}

// ---------------- custom cursor ring ----------------
const INTERACTIVE = "a, button, select, summary, [role=button], [role=tab], [role=switch], mark.hl, label, input[type=checkbox], input[type=color]";

export function CursorRing() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current!;
    let x = -100, y = -100, cx = -100, cy = -100, raf = 0;
    const loop = () => {
      cx += (x - cx) * 0.22;
      cy += (y - cy) * 0.22;
      el.style.translate = `${cx}px ${cy}px`;
      raf = requestAnimationFrame(loop);
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      el.classList.add("on");
      const t = e.target as Element | null;
      const hit = t?.closest?.(INTERACTIVE);
      el.classList.toggle("hover", !!hit && !(hit as HTMLButtonElement).disabled);
    };
    const leave = () => el.classList.remove("on");
    const down = () => el.classList.add("down");
    const up = () => el.classList.remove("down");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  return <div ref={ref} className="cursor-ring" aria-hidden />;
}

// ---------------- count-up number ----------------
export function CountUp({ value, format = (v: number) => String(Math.round(v)), ms = 900 }: { value: number; format?: (v: number) => string; ms?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : ms;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format(shown)}</>;
}

// ---------------- celebration burst ----------------
const burstListeners = new Set<(x: number, y: number) => void>();
export function celebrate(from?: Element | null) {
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 2 : window.innerHeight / 2;
  burstListeners.forEach((l) => l(x, y));
}
const COLORS = ["#7C5CFF", "#C6F432", "#FF5D5D", "#0A0B14", "#5B3FE0"];
export function Celebration() {
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  useEffect(() => {
    const l = (x: number, y: number) => {
      const id = Date.now() + Math.random();
      setBursts((b) => [...b, { id, x, y }]);
      setTimeout(() => setBursts((b) => b.filter((z) => z.id !== id)), 1300);
    };
    burstListeners.add(l);
    return () => {
      burstListeners.delete(l);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[95]" aria-hidden>
      {bursts.map((b) =>
        Array.from({ length: 28 }, (_, i) => {
          const angle = (i / 28) * Math.PI * 2;
          const dist = 70 + ((i * 37) % 90);
          return (
            <span
              key={`${b.id}-${i}`}
              className="absolute block h-2 w-1.5 rounded-sm"
              style={
                {
                  left: b.x,
                  top: b.y,
                  background: COLORS[i % COLORS.length],
                  "--dx": `${Math.cos(angle) * dist}px`,
                  "--dy": `${Math.sin(angle) * dist + 40}px`,
                  "--rot": `${(i * 47) % 360}deg`,
                  animation: `confetti ${0.9 + (i % 5) * 0.08}s cubic-bezier(0.2,0.7,0.3,1) forwards`,
                } as React.CSSProperties
              }
            />
          );
        }),
      )}
    </div>
  );
}

// ---------------- check pipeline progress ----------------
export const STAGES = [
  { key: "extract", label: "Reading content" },
  { key: "rules", label: "Rule checks" },
  { key: "ai", label: "AI layer" },
  { key: "guard", label: "Grounding guard" },
] as const;

export function stageFromMessage(msg: string | null): number {
  if (!msg) return -1;
  const m = msg.toLowerCase();
  if (m.includes("ai layer") || m.includes("rewrite")) return 2;
  if (m.includes("rule")) return 1;
  return 0;
}

export function CheckProgress({ message, useAI }: { message: string | null; useAI: boolean }) {
  const stage = stageFromMessage(message);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // after a few seconds on the AI step, show the guard as the next active step
  const active = stage === 2 && tick > 3 ? 3 : stage;
  const stages = useAI ? STAGES : STAGES.filter((s) => s.key === "extract" || s.key === "rules");
  return (
    <div className="pop-in mt-4 rounded-lg border border-teal/30 bg-teal-soft/60 p-4" role="status" aria-live="polite">
      <ol className="flex flex-wrap items-center gap-2">
        {stages.map((s, i) => {
          const idx = STAGES.findIndex((x) => x.key === s.key);
          const done = idx < active;
          const now = idx === active;
          return (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              {i > 0 && <span className={`h-px w-6 ${done || now ? "bg-teal" : "bg-line"}`} />}
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold transition-colors ${done ? "bg-teal text-white" : now ? "bg-white text-teal ring-2 ring-teal" : "bg-white text-muted"}`}>
                {done ? "✓" : now ? <Spinner className="h-3 w-3" /> : i + 1}
              </span>
              <span className={now ? "font-semibold text-teal" : done ? "text-teal" : "text-muted"}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm text-teal">{message}</p>
      <div className="shimmer mt-2 h-1.5 rounded-full" />
    </div>
  );
}
