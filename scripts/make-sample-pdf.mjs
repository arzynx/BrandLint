// Generates public/samples/popup-flyer.pdf, a two-page sample flyer with planted issues.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

function page(lines) {
  const p = doc.addPage([595, 842]);
  p.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.965, 0.945, 0.906) });
  let y = 780;
  for (const [text, size, isBold] of lines) {
    p.drawText(text, { x: 50, y, size, font: isBold ? bold : font, color: rgb(0.106, 0.106, 0.106) });
    y -= size + 14;
  }
}

page([
  ["LUMERA Skincare Pop-up, Phoenix Mall", 22, true],
  ["Your skin, your rules.", 16, false],
  ["Visit us this weekend for free skin consultations.", 12, false],
  ["Our Barrier Repair Cream is the best moisturiser in India, now Rs. 599.", 12, false],
  ["Trusted by 10 lakh customers.", 12, false],
  ["Instantly erase fine lines with our anti-aging range.", 12, false],
]);
page([
  ["Store offers", 20, true],
  ["Flat 25% off on all serums, valid till 30 Nov.", 12, false],
  ["Daily Sunscreen SPF 50 at Rs. 549.", 12, false],
  ["Dermatologically tested on sensitive skin.", 12, false],
  ["Scan the QR code or click here for directions.", 12, false],
  ["Skin, explained.", 14, true],
]);

writeFileSync(new URL("../public/samples/popup-flyer.pdf", import.meta.url), await doc.save());
console.log("wrote popup-flyer.pdf");
