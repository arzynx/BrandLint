import type { Role } from "./types";

export const PEOPLE: Record<Role, { name: string; title: string; team: string; blurb: string }> = {
  creator: {
    name: "Priya",
    title: "Social media executive",
    team: "Social",
    blurb: "Writes posts, uploads banners and PDFs, fixes findings before review.",
  },
  reviewer: {
    name: "Rahul",
    title: "Brand manager",
    team: "Brand",
    blurb: "Reviews by exception, approves or requests changes, comments.",
  },
  owner: {
    name: "Ananya",
    title: "Head of brand",
    team: "Brand",
    blurb: "Owns the guideline, approved facts and terminology. Reads the insights.",
  },
};

export const ROLE_LABEL: Record<Role, string> = { creator: "Creator", reviewer: "Reviewer", owner: "Brand owner" };
