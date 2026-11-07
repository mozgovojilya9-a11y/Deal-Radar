import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, secret-free health check: which search keys are configured on this deployment
 * (true/false only, never the values) and which commit is live.
 */
export async function GET() {
  const present = (name: string) => Boolean(process.env[name] && String(process.env[name]).trim().length > 0);
  return NextResponse.json({
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
    environment: process.env.VERCEL_ENV || null,
    search: {
      tavily: present("TAVILY_API_KEY"),
      tavilyKeyLooksValid: /^tvly-/.test(String(process.env.TAVILY_API_KEY || "").trim()),
      braveApi: present("BRAVE_SEARCH_API_KEY"),
      googleCse: present("GOOGLE_CSE_KEY") && present("GOOGLE_CSE_CX"),
      gemini: present("GEMINI_API_KEY"),
    },
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
