import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { safeOpsRedirectPath } from "@/lib/ga4-shared";
import { exchangeCode } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = getEnv();
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const next = safeOpsRedirectPath(cookieStore.get("adrunr_oauth_next")?.value);
  cookieStore.delete("adrunr_oauth_next");

  if (error) {
    return NextResponse.redirect(new URL(`${next}?error=${encodeURIComponent(error)}`, env.appBaseUrl));
  }

  const expected = cookieStore.get("adrunr_oauth_state")?.value;
  cookieStore.delete("adrunr_oauth_state");

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL(`${next}?error=oauth-state`, env.appBaseUrl));
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(new URL(`${next}?connected=1`, env.appBaseUrl));
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth-exchange-failed";
    return NextResponse.redirect(new URL(`${next}?error=${encodeURIComponent(message)}`, env.appBaseUrl));
  }
}
