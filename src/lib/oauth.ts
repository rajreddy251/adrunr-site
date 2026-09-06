import "server-only";

import { google } from "googleapis";

import { decryptOAuthTokenFields } from "./crypto";
import { getEnv } from "./env";
import { loadActiveConnection, saveGoogleTokens, type TokenBundle } from "./connections";
import { GOOGLE_OAUTH_SCOPES } from "./providers";

export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const OAUTH_SCOPES = GOOGLE_OAUTH_SCOPES;

export function createOAuthClient(redirectUri?: string) {
  const env = getEnv();
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    redirectUri ?? env.oauthRedirectUri,
  );
}

export function buildAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...OAUTH_SCOPES],
    state,
  });
}

export async function exchangeCode(code: string): Promise<TokenBundle> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error("Google did not return tokens. Re-run Connect with prompt=consent.");
  }

  client.setCredentials(tokens);
  let email: string | undefined;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email ?? undefined;
  } catch {
    email = undefined;
  }

  const stored: TokenBundle = {
    refreshToken: tokens.refresh_token || `access-only:${tokens.access_token ?? ""}`,
    accessToken: tokens.access_token ?? undefined,
    expiryDate: tokens.expiry_date ?? undefined,
    email,
    scope: tokens.scope ?? OAUTH_SCOPES.join(" "),
    source: "oauth",
  };

  await saveGoogleTokens(stored);
  return stored;
}

export async function getAccessToken(): Promise<string> {
  const env = getEnv();
  const loaded = await loadActiveConnection();
  if (!loaded) {
    throw Object.assign(new Error("Google Ads is not connected."), {
      status: 401,
      info: {
        kind: "not_connected",
        hint: "Click Connect Google Ads, or set GOOGLE_ADS_REFRESH_TOKEN / ADRUNR_MOCK=1.",
      },
    });
  }

  if (env.mockMode || loaded.source === "mock") {
    return "mock-access-token";
  }

  const { refreshToken: refreshPlain, accessToken: accessPlain } = decryptOAuthTokenFields(
    loaded.connection,
  );
  const client = createOAuthClient();
  const refreshToken = refreshPlain.startsWith("access-only:") ? undefined : refreshPlain;

  client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessPlain,
    expiry_date: loaded.connection.accessTokenExpiresAt?.getTime(),
  });

  const result = await client.getAccessToken();
  if (!result.token) {
    throw new Error("Unable to obtain a Google access token. Disconnect and Connect again.");
  }
  return result.token;
}
