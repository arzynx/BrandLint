import type { Decision, Finding, Revision, Segment } from "./types";

/** Text after applying accepted/edited replacements. Non-overlapping, applied right to left. */
export function applyDecisions(seg: Segment, findings: Finding[], decisions: Record<string, Decision>): string {
  const edits = findings
    .filter((f) => f.segmentId === seg.id && f.excerpt && f.start != null && f.end != null)
    .map((f) => {
      const d = decisions[f.id];
      if (!d) return null;
      if (d.action === "edited" && d.editedText != null) return { f, to: d.editedText };
      if (d.action === "accepted" && f.suggestion != null) return { f, to: f.suggestion };
      return null;
    })
    .filter((x): x is { f: Finding; to: string } => x !== null)
    .sort((a, b) => b.f.start! - a.f.start!);
  let text = seg.text;
  let lastStart = Infinity;
  for (const { f, to } of edits) {
    if (f.end! > lastStart) continue; // overlap: keep the later one
    text = text.slice(0, f.start!) + to + text.slice(f.end!);
    lastStart = f.start!;
  }
  return text;
}

export function openFindings(rev: Revision) {
  return rev.findings.filter((f) => !rev.decisions[f.id]);
}

/** Must-fix findings with no decision yet (high severity, high confidence). See governance.ts. */
export { blockingFindings } from "./governance";

export type DiffPart = { kind: "same" | "add" | "del"; text: string };

/** Word-level diff (LCS). Fine for post-sized text. */
export function diffWords(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  if (A.length * B.length > 400_000) return [{ kind: "del", text: a }, { kind: "add", text: b }];
  const m = A.length, n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { push("same", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", A[i++]);
    else push("add", B[j++]);
  }
  while (i < m) push("del", A[i++]);
  while (j < n) push("add", B[j++]);
  return out;
}
