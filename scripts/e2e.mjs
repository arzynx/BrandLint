// End-to-end smoke test of the full workflow in a real browser.
// Usage: node scripts/e2e.mjs [baseUrl] [screenshotDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = process.argv[3] ?? "e2e-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const step = (s) => console.log("•", s);

step("home");
await page.goto(BASE);
await page.getByRole("link", { name: /Try it in 60 seconds/ }).click();
await page.waitForURL(/\/submit/);
await page.waitForFunction(() => document.querySelector("textarea#text")?.value.length > 20);
await shot("01-submit");

step("run text check");
await page.getByRole("button", { name: "Run checks" }).click();
await page.waitForURL(/\/s\//, { timeout: 60000 });
await page.waitForSelector("article[id^=finding-]");
const n = await page.locator("article[id^=finding-]").count();
console.log("  findings:", n);
await shot("02-findings");

step("decide every finding");
for (let i = 0; i < 40; i++) {
  const accept = page.getByRole("button", { name: /^(Accept fix|Acknowledge)$/ }).first();
  if (!(await accept.count())) break;
  // dismiss one with a reason to exercise that path
  if (i === 2) {
    await page.getByRole("button", { name: "Dismiss…" }).first().click();
    await page.getByRole("button", { name: "Quoting a customer or third party" }).click();
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    continue;
  }
  await accept.click();
}
await shot("03-decided");

step("re-check as revision 2");
await page.getByRole("button", { name: /Re-check as revision 2/ }).click();
await page.getByRole("tab", { name: /Rev 2/ }).waitFor({ timeout: 60000 });
const n2 = await page.locator("article[id^=finding-]").count();
console.log("  findings in rev 2:", n2);
for (let i = 0; i < 40; i++) {
  const accept = page.getByRole("button", { name: /^(Accept fix|Acknowledge)$/ }).first();
  if (!(await accept.count())) break;
  await accept.click();
}
// keep re-checking while accepted fixes leave unsaved changes (AI fixes can vary run to run)
for (let rev = 3; rev <= 7 && (await page.getByText("You have unsaved fixes").count()); rev++) {
  await page.getByRole("button", { name: new RegExp(`Re-check as revision ${rev}`) }).click();
  await page.getByRole("tab", { name: new RegExp(`Rev ${rev}`) }).waitFor({ timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    const accept = page.getByRole("button", { name: /^(Accept fix|Acknowledge)$/ }).first();
    if (!(await accept.count())) break;
    await accept.click();
  }
  console.log("  re-checked to revision", rev);
}
await shot("04-rev2");

step("submit for review");
await page.getByRole("button", { name: "Submit for review" }).click();
await page.getByText("Waiting for a reviewer").waitFor();

step("reviewer approves");
await page.getByLabel("Switch role").selectOption("reviewer");
await page.getByLabel("Review comment").fill("Looks good, thanks for fixing the claims.");
await page.getByRole("button", { name: "Approve" }).click();
await page.getByText(/^Approved\. A named human/).waitFor();
await shot("05-approved");

step("PDF sample");
await page.getByLabel("Switch role").selectOption("creator");
await page.goto(BASE + "/submit?sample=flyer");
await page.getByText("popup-flyer.pdf").waitFor({ timeout: 20000 });
await page.getByRole("button", { name: "Run checks" }).click();
await page.waitForURL(/\/s\//, { timeout: 60000 });
await page.waitForSelector("article[id^=finding-]");
console.log("  pdf findings:", await page.locator("article[id^=finding-]").count());
await shot("06-pdf");

step("image sample (OCR)");
await page.goto(BASE + "/submit?sample=banner");
await page.getByText("festive-banner.png").waitFor({ timeout: 20000 });
await page.getByRole("button", { name: "Run checks" }).click();
await page.waitForURL(/\/s\//, { timeout: 180000 });
await page.waitForSelector("article[id^=finding-]");
const imgFindings = await page.locator("article[id^=finding-] h3").allTextContents();
console.log("  image findings:", imgFindings.length, imgFindings.join(" | "));
await shot("07-image");

step("on-brand image");
await page.goto(BASE + "/submit?sample=banner-ok");
await page.getByText("onbrand-banner.png").waitFor({ timeout: 20000 });
await page.getByRole("button", { name: "Run checks" }).click();
await page.waitForURL(/\/s\//, { timeout: 180000 });
await page.waitForTimeout(500);
const okFindings = await page.locator("article[id^=finding-] h3").allTextContents();
console.log("  on-brand image findings:", okFindings.length, okFindings.join(" | "));
await shot("08-image-ok");

step("other pages");
for (const [p, name] of [["/insights", "09-insights"], ["/eval", "10-eval"], ["/guideline", "11-guideline"], ["/trust", "12-trust"], ["/submissions", "13-submissions"], ["/", "00-home"]]) {
  await page.goto(BASE + p);
  await page.waitForTimeout(400);
  await shot(name);
}
await page.getByLabel("Switch role").selectOption("owner");
await page.goto(BASE + "/insights");
await page.getByRole("button", { name: "Draft a clearer rule" }).first().click();
await page.getByRole("button", { name: "Update the guideline" }).click();
await page.getByText(/Saved as guideline v/).waitFor();
await shot("14-gap-fixed");

console.log("errors:", errors.length ? errors : "none");
await browser.close();
