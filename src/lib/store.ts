"use client";

import { useSyncExternalStore } from "react";
import { demoBrand } from "./brand/demo";
import { PEOPLE } from "./people";
import { seedHistory } from "./seed";
import type { AuditEvent, Brand, Role, Submission } from "./types";

/**
 * The workspace lives in the visitor's browser (localStorage). Every judge or
 * tester gets their own private sandbox; content is only sent to the server
 * for checking and is never stored there.
 */

export interface State {
  v: 2;
  brand: Brand;
  submissions: Submission[];
  audit: AuditEvent[];
  role: Role;
  useAI: boolean;
  showSample: boolean;
}

const KEY = "brandlint:v2"; // v2: claim registry, verdicts, scoped rules (v1 workspaces are not migrated)

function fresh(): State {
  return {
    v: 2,
    brand: structuredClone(demoBrand),
    submissions: seedHistory(),
    audit: [],
    role: "creator",
    useAI: true,
    showSample: true,
  };
}

let state: State | null = null;
const listeners = new Set<() => void>();

function load(): State {
  if (state) return state;
  if (typeof window === "undefined") return (state = fresh());
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.v === 2) return (state = s);
    }
  } catch {
    /* corrupted storage: start fresh */
  }
  return (state = fresh());
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded (large image thumbnails): drop thumbnails of the oldest items and retry once.
    const s = state!;
    s.submissions.slice(10).forEach((x) => delete x.image);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* give up silently; state stays in memory */
    }
  }
}

export function getState(): State {
  return load();
}

export function setState(fn: (s: State) => State | void) {
  const draft = structuredClone(load());
  state = fn(draft) ?? draft;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = fresh();

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => sel(load()),
    () => sel(serverSnapshot),
  );
}

export function actor(s: State) {
  return PEOPLE[s.role].name;
}

export function log(s: State, action: string, detail: string) {
  s.audit.unshift({ at: new Date().toISOString(), actor: actor(s), role: s.role, action, detail });
  s.audit = s.audit.slice(0, 500);
}

export function resetWorkspace() {
  state = fresh();
  persist();
  listeners.forEach((l) => l());
}
