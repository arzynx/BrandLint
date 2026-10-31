export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex for a literal phrase with word-ish boundaries that also work for "#1" or "anti-aging". */
export function phraseRegex(phrase: string, flags = "gi"): RegExp {
  const body = escapeRegex(phrase).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\w-])${body}(?![\\w-])`, flags);
}

export interface Match {
  start: number;
  end: number;
  text: string;
  groups: string[];
}

export function findAll(text: string, re: RegExp): Match[] {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const r = new RegExp(re.source, flags);
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = r.exec(text))) {
    if (m[0].length === 0) {
      r.lastIndex++;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1) });
  }
  return out;
}

export interface Span {
  start: number;
  end: number;
  text: string;
}

/** Split into sentences, keeping offsets into the original text. */
const ABBREV = /(?:^|[\s(])(?:rs|no|inr|approx|vs|etc|e\.g|i\.e|mr|mrs|ms|dr|st)\.$/i;

/** Split into sentences, keeping offsets. Doesn't break on "Rs. 799", "No. 1" or "4.5". */
export function sentences(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;
  const push = (end: number) => {
    const t = text.slice(start, end);
    if (t.trim()) out.push({ start, end, text: t });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      push(i + 1);
      continue;
    }
    if (c !== "." && c !== "!" && c !== "?") continue;
    let j = i;
    while (j + 1 < text.length && /[.!?]/.test(text[j + 1])) j++;
    const next = text[j + 1];
    if (next !== undefined && !/\s/.test(next)) {
      i = j; // "4.5", "lumeraskin.in"
      continue;
    }
    if (c === "." && ABBREV.test(text.slice(Math.max(0, i - 8), i + 1))) {
      i = j;
      continue;
    }
    push(j + 1);
    i = j;
  }
  push(text.length);
  return out;
}

export function sentenceAt(text: string, index: number): Span {
  return (
    sentences(text).find((s) => index >= s.start && index < s.end) ?? {
      start: 0,
      end: text.length,
      text,
    }
  );
}

/** Keep the capitalisation style of the original word when suggesting a replacement. */
export function matchCase(original: string, replacement: string): string {
  if (/[a-z]/i.test(original) && original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase() && /[a-z]/i.test(original[0]))
    return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#%₹]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let counter = 0;
export function uid(prefix = "id"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
