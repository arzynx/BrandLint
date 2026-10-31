"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PEOPLE, ROLE_LABEL } from "@/lib/people";
import { SAMPLES } from "@/lib/samples";
import { log, setState } from "@/lib/store";
import type { Role } from "@/lib/types";
import { toast } from "./fx";
import { Icon, type IconName } from "./icons";

interface Command {
  id: string;
  group: "Go to" | "Run a sample check" | "Act as";
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
}

const PAGES: { href: string; label: string; icon: IconName; hint: string }[] = [
  { href: "/submit", label: "New check", icon: "plus", hint: "Paste text, upload a PDF or an image" },
  { href: "/submissions", label: "Submissions", icon: "inbox", hint: "Everything checked so far" },
  { href: "/review", label: "Review queue", icon: "review", hint: "Waiting for a reviewer" },
  { href: "/insights", label: "Insights", icon: "insights", hint: "Guideline gaps, disputes, trends" },
  { href: "/guideline", label: "Guideline", icon: "book", hint: "Rules, facts, claim registry, terms" },
  { href: "/eval", label: "Accuracy", icon: "target", hint: "Measured precision and recall" },
  { href: "/trust", label: "How it works", icon: "info", hint: "AI disclosure, privacy, limits" },
];

/** ⌘K / Ctrl+K palette: jump to a page, run a sample check, or switch role. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const act = (r: Role) => () => {
      setState((s) => {
        s.role = r;
        log(s, "switched role", `now acting as ${ROLE_LABEL[r]}`);
      });
      toast(`Now acting as ${PEOPLE[r].name}, ${ROLE_LABEL[r]}`, { kind: "info" });
    };
    return [
      ...PAGES.map((p) => ({ id: p.href, group: "Go to" as const, label: p.label, hint: p.hint, icon: p.icon, run: go(p.href) })),
      ...SAMPLES.map((s) => ({ id: `sample-${s.id}`, group: "Run a sample check" as const, label: s.label, hint: s.format.toUpperCase(), icon: "file" as const, run: go(`/submit?sample=${s.id}`) })),
      ...(Object.keys(PEOPLE) as Role[]).map((r) => ({ id: `role-${r}`, group: "Act as" as const, label: `${PEOPLE[r].name}, ${ROLE_LABEL[r]}`, hint: PEOPLE[r].title, icon: "user" as const, run: act(r) })),
    ];
  }, [router]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? commands.filter((c) => `${c.label} ${c.hint ?? ""} ${c.group}`.toLowerCase().includes(t)) : commands;
  }, [commands, q]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    setQ("");
    setSel(0);
    c.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(shown.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(shown[sel]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-night/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="palette-in w-full max-w-xl overflow-hidden rounded-2xl border border-white/12 bg-[#11122a] text-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Icon name="search" className="text-[#8E8AB8]" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKey}
            placeholder="Search pages, samples, people…"
            className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-[#8E8AB8]"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={shown[sel] ? `cmd-${shown[sel].id}` : undefined}
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-[#8E8AB8]">ESC</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-[#8E8AB8]">Nothing matches “{q}”.</li>}
          {shown.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {header && <div className="eyebrow px-3 pb-1 pt-3 text-[#8E8AB8]">{header}</div>}
                <div
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(c)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === sel ? "bg-violet/25 text-white" : "text-[#D9D6F5]"}`}
                >
                  <Icon name={c.icon} className={i === sel ? "text-lime" : "text-[#8E8AB8]"} />
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="truncate text-xs text-[#8E8AB8]">{c.hint}</span>}
                  {i === sel && <Icon name="arrow" size={14} className="text-lime" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
