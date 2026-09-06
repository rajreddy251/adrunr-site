import type { ProviderCategory } from "@prisma/client";

export const GOOGLE_ADS_SLUG = "google_ads";
export const GOOGLE_ANALYTICS_SLUG = "google_analytics";

export const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export const GOOGLE_OAUTH_SCOPES = [ADS_SCOPE, GA4_SCOPE, "openid", "email", "profile"] as const;

export const CONNECTABLE_PROVIDER_SLUGS = [GOOGLE_ADS_SLUG] as const;

export type SeedProvider = {
  slug: string;
  name: string;
  category: ProviderCategory;
  isActive: boolean;
  oauthAuthUrl: string | null;
  oauthTokenUrl: string | null;
  defaultScopes: string | null;
};

export const SEED_PROVIDERS: SeedProvider[] = [
  {
    slug: GOOGLE_ADS_SLUG,
    name: "Google Ads",
    category: "ADS",
    isActive: true,
    oauthAuthUrl: GOOGLE_OAUTH_AUTH_URL,
    oauthTokenUrl: GOOGLE_OAUTH_TOKEN_URL,
    defaultScopes: GOOGLE_OAUTH_SCOPES.join(" "),
  },
  {
    slug: GOOGLE_ANALYTICS_SLUG,
    name: "Google Analytics (GA4)",
    category: "ANALYTICS",
    isActive: true,
    oauthAuthUrl: GOOGLE_OAUTH_AUTH_URL,
    oauthTokenUrl: GOOGLE_OAUTH_TOKEN_URL,
    defaultScopes: [GA4_SCOPE, "openid", "email", "profile"].join(" "),
  },
  {
    slug: "microsoft_clarity",
    name: "Microsoft Clarity",
    category: "HEATMAP",
    isActive: true,
    oauthAuthUrl: null,
    oauthTokenUrl: null,
    defaultScopes: null,
  },
  {
    slug: "meta_ads",
    name: "Meta Ads",
    category: "ADS",
    isActive: true,
    oauthAuthUrl: null,
    oauthTokenUrl: null,
    defaultScopes: null,
  },
  {
    slug: "tiktok_ads",
    name: "TikTok Ads",
    category: "ADS",
    isActive: true,
    oauthAuthUrl: null,
    oauthTokenUrl: null,
    defaultScopes: null,
  },
  {
    slug: "linkedin_ads",
    name: "LinkedIn Ads",
    category: "ADS",
    isActive: true,
    oauthAuthUrl: null,
    oauthTokenUrl: null,
    defaultScopes: null,
  },
  {
    slug: "heartza",
    name: "Heartza",
    category: "OTHER",
    isActive: true,
    oauthAuthUrl: null,
    oauthTokenUrl: null,
    defaultScopes: null,
  },
  {
    slug: "custom",
    name: "Custom / future",
    category: "OTHER",
    isActive: true,
    oauthAuthUrl: null,
    oauthTokenUrl: null,
    defaultScopes: null,
  },
];

export function isConnectEnabled(slug: string): boolean {
  return (CONNECTABLE_PROVIDER_SLUGS as readonly string[]).includes(slug);
}
