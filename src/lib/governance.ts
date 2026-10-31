import type { Decision, Finding, Revision, Role, Route } from "./types";

/**
 * Confidence-aware human governance. Severity says how much a problem matters;
 * confidence says how sure the system is. Together they decide who must look at it.
 */

export const BLOCK_CONFIDENCE = 0.75;

export const ROUTE_LABEL: Record<Route, string> = {
  blocker: "Must fix",
  escalate: "Needs a reviewer's judgement",
  review: "Review",
  advisory: "Worth a look",
};

export function routeOf(f: Pick<Finding, "severity" | "confidence">): Route {
  if (f.severity === "high") return f.confidence >= BLOCK_CONFIDENCE ? "blocker" : "escalate";
  if (f.severity === "medium" && f.confidence >= 0.6) return "review";
  return "advisory";
}

/** High-risk findings whose dismissal needs the brand owner's sign-off, not just a reviewer's. */
export function ownerSignOff(f: Finding): boolean {
  return f.severity === "high" && (f.category === "claim" || f.category === "fact");
}

/** Who may make each decision. Creators can't override; only reviewers and owners rule a finding out. */
export function canDecide(role: Role, action: Decision["action"], f: Finding): boolean {
  if (action === "overridden") return role !== "creator" && (!ownerSignOff(f) || role === "owner");
  if (action === "dismissed") return role === "creator" || role === "reviewer" || role === "owner";
  return true;
}

/** Blockers with no decision. A submission can't go to review while any remain. */
export function blockingFindings(rev: Revision): Finding[] {
  return rev.findings.filter((f) => routeOf(f) === "blocker" && !rev.decisions[f.id]);
}

export interface Requirement {
  finding: Finding;
  why: string;
  needs: Role; // the least senior role that can clear it
  cleared: boolean;
}

/**
 * What must happen before approval. Every creator dismissal of a blocker or
 * escalated finding needs a reviewer ruling (upheld or reinstated); high-risk
 * claim and fact dismissals need the brand owner. Open escalations need a decision.
 */
export function approvalRequirements(rev: Revision): Requirement[] {
  const out: Requirement[] = [];
  for (const f of rev.findings) {
    const route = routeOf(f);
    if (route !== "blocker" && route !== "escalate") continue;
    const d = rev.decisions[f.id];
    const needs: Role = ownerSignOff(f) ? "owner" : "reviewer";
    if (!d) {
      out.push({ finding: f, why: route === "blocker" ? "Unresolved must-fix finding" : "Uncertain high-severity finding needs a decision", needs, cleared: false });
    } else if (d.action === "overridden" || (d.action === "dismissed" && d.role && outranks(d.role, needs))) {
      continue; // ruled out by someone senior enough
    } else if (d.action === "dismissed") {
      // Upheld by someone senior enough clears it; reinstated means it must be fixed in a new revision.
      const ruled = d.review?.outcome === "upheld" && outranks(d.review.role, needs);
      out.push({ finding: f, why: `Creator dismissed a ${route === "blocker" ? "must-fix" : "high-severity"} finding: "${d.reason ?? ""}"`, needs, cleared: Boolean(ruled) });
    }
  }
  return out;
}

export type RoutingLevel = "fast_track" | "standard" | "escalated";

export const ROUTING_LABEL: Record<RoutingLevel, string> = {
  fast_track: "Fast track: no open issues above low severity",
  standard: "Standard review",
  escalated: "Escalated: needs brand owner sign-off",
};

/** Which review path a revision takes when it's submitted. */
export function routing(rev: Revision): { level: RoutingLevel; reasons: string[] } {
  const reqs = approvalRequirements(rev);
  const owner = reqs.filter((r) => r.needs === "owner" && !r.cleared);
  if (owner.length) return { level: "escalated", reasons: owner.map((r) => `${r.finding.title}: ${r.why}`) };
  const reasons = reqs.filter((r) => !r.cleared).map((r) => `${r.finding.title}: ${r.why}`);
  for (const f of rev.findings) {
    const d = rev.decisions[f.id];
    if (f.severity !== "low" && (!d || d.action === "dismissed") && !reqs.some((r) => r.finding.id === f.id))
      reasons.push(`${f.title}: ${d ? "dismissed by the creator" : "open"}`);
  }
  return reasons.length ? { level: "standard", reasons } : { level: "fast_track", reasons: [] };
}

const RANK: Record<Role, number> = { creator: 0, reviewer: 1, owner: 2 };

export function outranks(role: Role, needs: Role): boolean {
  return RANK[role] >= RANK[needs];
}

/**
 * Can this role approve the revision now? Approval never clears requirements
 * implicitly: each one is ruled on individually first (uphold / reinstate / override).
 */
export function canApprove(role: Role, rev: Revision): { ok: boolean; outstanding: Requirement[] } {
  const outstanding = approvalRequirements(rev).filter((r) => !r.cleared);
  return { ok: role !== "creator" && outstanding.length === 0, outstanding };
}
