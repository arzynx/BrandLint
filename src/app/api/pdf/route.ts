import { extractText, getDocumentProxy } from "unpdf";
import { bad, rateLimited } from "@/lib/server";

export const maxDuration = 30;

/** Extract text page by page. The file is processed in memory and never stored. */
export async function POST(req: Request) {
  if (rateLimited(req, 20)) return bad("Too many uploads, please wait a minute.", 429);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return bad("No file");
  if (file.size > 4 * 1024 * 1024) return bad("PDF must be under 4 MB");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = text.slice(0, 30).map((t) => t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
    return Response.json({ totalPages, pages });
  } catch (e) {
    console.error("pdf parse failed", e);
    return bad("Couldn't read this PDF. Is it a scanned image? Try uploading pages as images.", 422);
  }
}
