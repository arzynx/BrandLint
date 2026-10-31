import { connection } from "next/server";
import { aiAvailable, aiModelName } from "@/lib/ai";

export async function GET() {
  await connection(); // evaluate per request, not at build time
  return Response.json({ ai: aiAvailable(), provider: "Google Gemini API", model: aiAvailable() ? aiModelName() : null });
}
