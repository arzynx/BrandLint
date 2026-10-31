import type { Channel, Format } from "./types";

export interface Sample {
  id: string;
  label: string;
  format: Format;
  channel: Channel;
  title: string;
  text?: string;
  file?: string;
  altText?: string;
}

export const SAMPLES: Sample[] = [
  {
    id: "launch",
    label: "Instagram launch caption (several issues)",
    format: "text",
    channel: "instagram",
    title: "Glow Serum launch caption",
    text: `India's #1 fastest-growing skincare brand, clinically proven to remove dark spots in 7 days!! ✨✨

Our NEW Glow Serum is back at the 2022 price: just ₹699. Loved by 5 lakh+ users. Glow beyond limits.

Festive sale: 30% off, valid till 15 Nov. Click here to shop 👉 #glowserum #skinexplained ✨`,
  },
  {
    id: "influencer",
    label: "Influencer post (missing disclosure)",
    format: "text",
    channel: "instagram",
    title: "Creator post: Barrier Cream",
    text: `Been using the Lumera Skincare barrier cream for two weeks and my embarrassing dry patches are GONE. No side effects, 100% chemical-free.

Use my code PRIYA10 for a discount 💛 #barriercream`,
  },
  {
    id: "email",
    label: "Festive email (subtle issues)",
    format: "text",
    channel: "email",
    title: "Newsletter: festive picks",
    text: `Subject: Your festive skin edit is here

Hi there,

This Diwali, give your skin the care it deserves. Our award-winning Glow Serum won Best New Serum at the Beauty Edit Awards 2025, and our Daily Sunscreen SPF 50 is now ₹549.

Hurry, the festive offer of 20% off sitewide ends on 10 Nov. Dermatologist recommended and gentle on sensitive skin. 🎉🎉

Skin explained,
Team Lumera`,
  },
  {
    id: "clean",
    label: "On-brand caption (should pass)",
    format: "text",
    channel: "instagram",
    title: "Glow Serum explainer",
    text: `Meet the Glow Serum: vitamin C for brighter, even-looking tone. Shown in our 2024 consumer study to reduce the appearance of dark spots within 4 weeks (n=120).

Dermatologically tested on sensitive skin. 30 ml, ₹799.

Skin, explained. #SkinExplained`,
  },
  {
    id: "banner",
    label: "Festive banner image (off-brand)",
    format: "image",
    channel: "instagram",
    title: "Festive offer banner",
    file: "/samples/festive-banner.svg",
    altText: "",
  },
  {
    id: "banner-ok",
    label: "Product banner image (on-brand)",
    format: "image",
    channel: "website",
    title: "Glow Serum hero banner",
    file: "/samples/onbrand-banner.svg",
    altText: "Lumera Glow Serum bottle on a cream background with the text Meet the Glow Serum.",
  },
  {
    id: "flyer",
    label: "Two-page store flyer (PDF)",
    format: "pdf",
    channel: "print",
    title: "Pop-up store flyer",
    file: "/samples/popup-flyer.pdf",
  },
];
