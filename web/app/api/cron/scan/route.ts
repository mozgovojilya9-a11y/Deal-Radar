import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = process.env.GITHUB_REPOSITORY || "mozgovojilya9-a11y/Deal-Radar";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || request.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Free 10-minute scheduling: an external free cron (e.g. cron-job.org) calls this route; it starts the
 * GitHub Actions scanner via workflow_dispatch. A scan that is already queued or running is never
 * duplicated. Needs CRON_SECRET and GITHUB_DISPATCH_TOKEN (fine-grained token: Actions read & write).
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ error: "GITHUB_DISPATCH_TOKEN не настроен" }, { status: 503 });
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const base = "https://api.github.com/repos/" + REPO + "/actions/workflows/deals.yml";
  try {
    for (const status of ["in_progress", "queued"]) {
      const response = await fetch(base + "/runs?per_page=1&status=" + status, { headers, cache: "no-store" });
      if (!response.ok) throw new Error("GitHub HTTP " + response.status);
      const data = await response.json() as { total_count?: number };
      if ((data.total_count || 0) > 0) return NextResponse.json({ started: false, reason: "скан уже " + (status === "queued" ? "в очереди" : "выполняется") });
    }
    const dispatch = await fetch(base + "/dispatches", { method: "POST", headers, body: JSON.stringify({ ref: "main" }), cache: "no-store" });
    if (dispatch.status !== 204) throw new Error("dispatch HTTP " + dispatch.status);
    return NextResponse.json({ started: true, at: new Date().toISOString() });
  } catch (error) {
    console.error("cron scan dispatch failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "dispatch failed" }, { status: 502 });
  }
}
