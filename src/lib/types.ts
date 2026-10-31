export type Severity = "high" | "medium" | "low";
export type Category =
  | "claim"
  | "fact"
  | "terminology"
  | "messaging"
  | "tone"
  | "visual"
  | "accessibility";
export type Channel = "instagram" | "website" | "email" | "print";
export type Audience = "customers" | "professionals" | "investors" | "press";
export type Role = "creator" | "reviewer" | "owner";
export type Format = "text" | "pdf" | "image";

export const CHANNELS: Channel[] = ["instagram", "website", "email", "print"];
export const AUDIENCES: Audience[] = ["customers", "professionals", "investors", "press"];

/** Where a piece of content is going. Rules and claims can be scoped to parts of it. */
export interface ContentContext {
  channel: Channel;
  audience: Audience;
  region: string; // "IN", "Global", ...
  campaign?: string;
}

/** Empty or missing lists mean "applies everywhere". */
export interface Scope {
  channels?: Channel[];
  audiences?: Audience[];
  regions?: string[];
  campaigns?: string[];
}

export type RuleStatus = "draft" | "approved" | "retired";

/** A checkable rule derived from the brand guideline. */
export interface Rule {
  id: string;
  section: string; // e.g. "§4.2"
  title: string;
  text: string; // the clause as written in the guideline, quoted in findings
  category: Category;
  severity: Severity;
  enabled: boolean;
  status: RuleStatus; // only "approved" rules are enforced
  source: string; // document the clause comes from, e.g. "Brand Guidelines v3.pdf"
  owner: string; // person accountable for the rule
  scope?: Scope;
  updatedInVersion?: number; // guideline version in which the clause last changed
}

/** Approved product information: prices and offers. */
export interface Fact {
  id: string;
  label: string;
  value: string; // canonical wording that may be published
  kind: "price" | "offer" | "spec";
  aliases: string[]; // words that identify a sentence talking about this fact
  numeric?: number; // for price / offer
  validUntil?: string; // ISO date; after it the fact no longer applies
  source: string; // where the fact is evidenced
  owner: string; // information owner
  verifiedAt: string; // ISO date the value was last checked against the source
  reviewBy?: string; // ISO date it must be re-verified by
}

export type ClaimKind = "statistic" | "ranking" | "efficacy" | "award" | "certification";
export type ClaimStatus = "verified" | "pending" | "retired";

/** Brand Claim Registry: a promotional claim, its approved wording and its evidence. */
export interface Claim {
  id: string; // "C-01"
  label: string;
  wording: string; // approved wording, exactly as it may be published
  kind: ClaimKind;
  aliases: string[]; // words that identify a sentence talking about this claim
  supports: string[]; // phrases this claim substantiates
  numeric?: number; // statistic: the approved figure (a floor, e.g. 2 lakh+)
  evidence: string; // the document or data that substantiates it
  status: ClaimStatus;
  owner: string;
  verifiedAt: string;
  validUntil?: string; // evidence expires; the claim is unsupported after this
  usage?: Scope; // where the claim may be used
}

export interface Term {
  id: string;
  avoid: string[];
  prefer: string;
  note: string;
  severity: Severity;
}

export interface PaletteColor {
  name: string;
  hex: string;
}

export interface Brand {
  name: string;
  version: number;
  tagline: string;
  retiredTaglines: string[];
  rules: Rule[];
  facts: Fact[];
  claims: Claim[];
  terms: Term[];
  palette: PaletteColor[];
}

export interface SourceRef {
  kind: "rule" | "fact" | "claim" | "term" | "wcag";
  id?: string; // id of the cited record; must resolve in the guideline version below
  ref: string; // "§4.2", "F-03", "C-01", "Terminology row 4", "WCAG 2.2 SC 1.4.3"
  quote: string; // exact clause / fact text
  doc?: string; // source document or evidence
  version?: number; // guideline version the finding was checked against
}

/**
 * What kind of problem a finding is. An unsupported statement is not a false one:
 * "unverified" means the organisation has no approved evidence for it, not that it's wrong.
 */
export type Verdict = "breach" | "contradicts" | "unverified";

/** How a finding is handled in the workflow; derived from severity, confidence and verdict. */
export type Route = "blocker" | "escalate" | "review" | "advisory";

export interface Finding {
  id: string;
  ruleId?: string;
  category: Category;
  severity: Severity;
  verdict: Verdict;
  title: string;
  message: string;
  segmentId: string;
  excerpt?: string; // the flagged text, verbatim from the segment
  start?: number;
  end?: number;
  source: SourceRef;
  evidence?: SourceRef; // the approved fact or claim the content was compared with, if different from the rule
  confidence: number; // 0..1
  suggestion?: string; // drop-in replacement for `excerpt`
  suggestionBy?: "rule" | "ai";
  advice?: string; // how to fix when there is no drop-in replacement
  origin: "rule" | "ai" | "vision";
}

export interface Segment {
  id: string;
  label: string; // "Text", "Page 2", "Text in image"
  text: string;
}

export interface CheckMeta {
  aiStatus: "ok" | "offline" | "error";
  aiModel?: string;
  aiProposed: number;
  aiRejected: number; // dropped by the grounding guard (no clause / excerpt not in text / unresolvable citation)
  aiError?: string; // short, user-safe reason when the AI layer failed
  ms: number;
  guidelineVersion?: number;
}

/**
 * accepted / edited / dismissed are the creator's decisions.
 * overridden is a reviewer or owner ruling that the finding doesn't apply.
 */
export type DecisionAction = "accepted" | "edited" | "dismissed" | "overridden";
export interface Decision {
  action: DecisionAction;
  reason?: string;
  editedText?: string;
  by: string;
  role?: Role;
  at: string;
  /** A reviewer's ruling on a creator's dismissal. Reinstated dismissals are a disagreement signal. */
  review?: { outcome: "upheld" | "reinstated"; by: string; role: Role; at: string; note?: string };
}

export interface Revision {
  n: number;
  segments: Segment[];
  findings: Finding[];
  decisions: Record<string, Decision>;
  meta: CheckMeta;
  createdAt: string;
  by: string;
}

export type Status = "draft" | "in_review" | "changes_requested" | "approved";

export interface Comment {
  id: string;
  by: string;
  role: Role;
  text: string;
  at: string;
  revision: number;
}

export interface Submission {
  id: string;
  title: string;
  channel: Channel;
  audience?: Audience;
  region?: string;
  campaign?: string;
  team: string;
  author: string;
  format: Format;
  status: Status;
  image?: string; // small data URL thumbnail for image submissions
  altText?: string;
  revisions: Revision[];
  comments: Comment[];
  events?: { at: string; actor: string; role: Role; text: string }[];
  createdAt: string;
  updatedAt: string;
  sample?: boolean; // part of seeded sample history
}

export interface AuditEvent {
  at: string;
  actor: string;
  role: Role;
  action: string;
  detail: string;
}
