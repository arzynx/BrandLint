"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { localToday } from "@/lib/checkClient";
import { ruleApplies, staleKnowledge } from "@/lib/knowledge";
import { PEOPLE, ROLE_LABEL } from "@/lib/people";
import { resetWorkspace, setState, useStore, log } from "@/lib/store";
import type { Role } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { Celebration, CursorRing, Toaster, toast } from "./fx";
import { Icon, type IconName } from "./icons";
import { Logo } from "./Logo";
import { AppBackground } from "./motion";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/submissions", label: "Submissions", icon: "inbox" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/insights", label: "Insights", icon: "insights" },
  { href: "/guideline", label: "Guideline", icon: "book" },
  { href: "/eval", label: "Accuracy", icon: "target" },
];

const AVATAR: Record<Role, string> = {
  creator: "bg-lime text-night",
  reviewer: "bg-violet text-white",
  owner: "bg-[#F6C453] text-night",
};

export interface AiStatus {
  ai: boolean;
  model: string | null;
  provider: string;
}
let statusCache: AiStatus | null = null;
export function useAiStatus(): AiStatus | null {
  const [s, setS] = useState<AiStatus | null>(statusCache);
  useEffect(() => {
    if (statusCache) return;
    fetch("/api/status")
      .then((r) => r.json())
      .then((j: AiStatus) => {
        statusCache = j;
        setS(j);
      })
      .catch(() => setS({ ai: false, model: null, provider: "Google Gemini API" }));
  }, []);
  return s;
}

const noop = () => () => {};
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Avatar button that opens a menu of the three demo people. */
function RoleMenu({ role, onPick }: { role: Role; onPick: (r: Role) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const me = PEOPLE[role];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Acting as ${me.name}, ${ROLE_LABEL[role]}. Switch role`}
        className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 py-1 pl-1 pr-2 text-left transition-colors hover:bg-white/10"
      >
        <span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${AVATAR[role]}`}>{me.name[0]}</span>
        <span className="hidden leading-tight md:block">
          <span className="block text-[13px] font-semibold text-white">{me.name}</span>
          <span className="block text-[11px] text-[#A9A6C9]">{ROLE_LABEL[role]}</span>
        </span>
        <Icon name="chevron" size={14} className="text-[#A9A6C9]" />
      </button>
      {open && (
        <div role="menu" className="palette-in absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-white/12 bg-[#11122a] p-1.5 shadow-2xl">
          <p className="eyebrow px-2.5 pb-1 pt-1.5 text-[#8E8AB8]">Act as</p>
          {(Object.keys(PEOPLE) as Role[]).map((r) => (
            <button
              key={r}
              role="menuitemradio"
              aria-checked={r === role}
              onClick={() => {
                setOpen(false);
                if (r !== role) onPick(r);
              }}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${r === role ? "bg-violet/20" : "hover:bg-white/5"}`}
            >
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${AVATAR[r]}`}>{PEOPLE[r].name[0]}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">
                  {PEOPLE[r].name} <span className="font-normal text-[#A9A6C9]">· {ROLE_LABEL[r]}</span>
                </span>
                <span className="block text-xs leading-snug text-[#8E8AB8]">{PEOPLE[r].blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Live workspace state under the header: what the guideline is, and what needs someone's attention. */
function StatusBar() {
  const brand = useStore((s) => s.brand);
  const inReview = useStore((s) => s.submissions.filter((x) => x.status === "in_review").length);
  const active = brand.rules.filter((r) => ruleApplies(r)).length;
  const stale = staleKnowledge(brand, localToday()).length;
  return (
    <div className="border-b border-line bg-white/75 text-xs text-muted backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
          <strong className="font-semibold text-ink">{brand.name}</strong> workspace
        </span>
        <Link href="/guideline" className="font-mono text-[11px] text-ink hover:text-violet-deep">
          Guideline v{brand.version} · {active} rules · {brand.claims.length} registry claims
        </Link>
        <Link href="/review" className={`inline-flex items-center gap-1.5 hover:text-ink ${inReview ? "text-ink" : ""}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${inReview ? "bg-violet" : "bg-line"}`} aria-hidden />
          {inReview ? `${inReview} awaiting review` : "Review queue clear"}
        </Link>
        <Link href="/guideline" className={`inline-flex items-center gap-1.5 hover:text-ink ${stale ? "text-medium" : ""}`}>
          <Icon name="clock" size={12} />
          {stale ? `${stale} facts and claims need re-verification` : "All approved information current"}
        </Link>
        <span className="ml-auto hidden items-center gap-2 sm:inline-flex">
          Demo data, private to this browser
          <button
            onClick={() => {
              if (confirm("Reset the demo workspace? Your checks and guideline edits in this browser will be cleared.")) {
                resetWorkspace();
                toast("Workspace reset", { kind: "info" });
              }
            }}
            className="rounded px-1.5 py-0.5 font-medium text-violet-deep hover:bg-violet/10"
          >
            Reset
          </button>
        </span>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const path = usePathname();
  const role = useStore((s) => s.role);
  const reviewCount = useStore((s) => s.submissions.filter((x) => x.status === "in_review").length);
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [palette, setPalette] = useState(false);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const a = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    setPill(a ? { left: a.offsetLeft, width: a.offsetWidth } : null);
  }, [path, mounted, reviewCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const switchRole = (r: Role) => {
    setState((s) => {
      s.role = r;
      log(s, "switched role", `now acting as ${ROLE_LABEL[r]}`);
    });
    toast(`Now acting as ${PEOPLE[r].name}, ${ROLE_LABEL[r]}`, { kind: "info" });
  };

  const onSubmit = path.startsWith("/submit");

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-night/90 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
          <Link href="/" className="group shrink-0" aria-label="BrandLint home">
            <Logo />
          </Link>
          <nav ref={navRef} aria-label="Main" className="relative flex flex-wrap gap-0.5 text-sm">
            {pill && <span className="nav-pill" style={{ left: pill.left, width: pill.width, top: 0 }} aria-hidden />}
            {NAV.map((n) => {
              const active = path === n.href || path.startsWith(n.href + "/") || (n.href === "/submissions" && path.startsWith("/s/"));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative z-10 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition-colors ${active ? "text-white" : "text-[#A9A6C9] hover:text-white"}`}
                >
                  <Icon name={n.icon} size={15} className={active ? "text-lime" : ""} />
                  {n.label}
                  {n.href === "/review" && mounted && reviewCount > 0 && (
                    <span className="rounded-full bg-lime px-1.5 font-mono text-[11px] font-bold text-night">{reviewCount}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPalette(true)}
              className="hidden items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-2.5 py-1.5 text-sm text-[#A9A6C9] transition-colors hover:bg-white/10 hover:text-white xl:inline-flex"
              aria-label="Open command palette"
            >
              <Icon name="search" size={15} />
              <span>Search</span>
              <kbd className="rounded border border-white/15 px-1 font-mono text-[10px]">Ctrl K</kbd>
            </button>
            <Link
              href="/trust"
              aria-label="How it works"
              title="How it works"
              className={`grid h-8 w-8 place-items-center rounded-xl border border-white/12 transition-colors hover:bg-white/10 hover:text-white ${path.startsWith("/trust") ? "bg-white/10 text-lime" : "text-[#A9A6C9]"}`}
            >
              <Icon name="info" size={16} />
            </Link>
            <Link
              href="/submit"
              aria-current={onSubmit ? "page" : undefined}
              className="inline-flex items-center gap-1.5 rounded-xl bg-lime px-3 py-1.5 text-sm font-semibold text-night shadow-[0_6px_20px_-8px_rgba(198,244,50,0.7)] transition hover:bg-[#d4ff4a]"
            >
              <Icon name="plus" size={15} />
              New check
            </Link>
            {mounted && <RoleMenu role={role} onPick={switchRole} />}
          </div>
        </div>
      </header>
      {mounted && <StatusBar />}
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {mounted ? (
          <div key={path} className="page-enter">
            {children}
          </div>
        ) : (
          <div className="py-24 text-center text-muted">Loading workspace…</div>
        )}
      </main>
      <footer className="border-t border-white/10 bg-night py-6 text-center text-xs text-[#8E8AB8]">
        BrandLint · Round 2 build · AI-suggested content is always labelled and needs a human decision.{" "}
        <Link href="/trust" className="text-lime underline-offset-2 hover:underline">
          How it works and what it can&apos;t do
        </Link>
      </footer>
      {mounted && (
        <>
          <CommandPalette open={palette} onClose={() => setPalette(false)} />
          <AppBackground />
          <Toaster />
          <Celebration />
          <CursorRing />
        </>
      )}
    </div>
  );
}
