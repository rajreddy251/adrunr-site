import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { saveGoogleTokens } from "@/lib/connections";
import { getEnv, oauthConfigured } from "@/lib/env";
import { MOCK_EMAIL } from "@/lib/mock-data";
import { buildAuthUrl, OAUTH_SCOPES } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();

  if (env.mockMode) {
    await saveGoogleTokens({
      refreshToken: "mock-refresh-token",
      accessToken: "mock-access-token",
      email: MOCK_EMAIL,
      scope: OAUTH_SCOPES.join(" "),
      source: "mock",
    });
    return NextResponse.redirect(new URL("/ops?connected=1", env.appBaseUrl));
  }

  if (!oauthConfigured(env)) {
    return NextResponse.redirect(new URL("/ops?error=oauth-not-configured", env.appBaseUrl));
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("adrunr_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appBaseUrl.startsWith("https"),
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
