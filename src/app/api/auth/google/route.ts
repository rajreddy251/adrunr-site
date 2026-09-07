import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { saveGoogleTokens } from "@/lib/connections";
import { getEnv, oauthConfigured } from "@/lib/env";
import { safeOpsRedirectPath } from "@/lib/ga4-shared";
import { MOCK_EMAIL } from "@/lib/mock-data";
import { buildAuthUrl, OAUTH_SCOPES } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = getEnv();
  const next = safeOpsRedirectPath(new URL(request.url).searchParams.get("next"));
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.appBaseUrl.startsWith("https"),
    path: "/",
    maxAge: 600,
  };

  if (env.mockMode) {
    await saveGoogleTokens({
      refreshToken: "mock-refresh-token",
      accessToken: "mock-access-token",
      email: MOCK_EMAIL,
      scope: OAUTH_SCOPES.join(" "),
      source: "mock",
    });
    return NextResponse.redirect(new URL(`${next}?connected=1`, env.appBaseUrl));
  }

  if (!oauthConfigured(env)) {
    return NextResponse.redirect(new URL(`${next}?error=oauth-not-configured`, env.appBaseUrl));
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("adrunr_oauth_state", state, cookieOptions);
  cookieStore.set("adrunr_oauth_next", next, cookieOptions);

  return NextResponse.redirect(buildAuthUrl(state));
}
