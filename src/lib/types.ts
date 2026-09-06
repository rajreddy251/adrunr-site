export type AdsAccountView = {
  customerId: string;
  descriptiveName: string;
  formattedId: string;
  manager: boolean;
  status: string;
  testAccount: boolean;
  level: number | null;
  warning: string | null;
  externalAccountId?: string;
};

export type ProviderView = {
  slug: string;
  name: string;
  category: string;
  isActive: boolean;
  connectEnabled: boolean;
  connected: boolean;
  accountEmail: string | null;
};

export type ConnectionStatusView = {
  connected: boolean;
  mockMode: boolean;
  email: string | null;
  source: "oauth" | "env" | "mock" | null;
  oauthConfigured: boolean;
  adsConfigured: boolean;
  loginCustomerId: string;
  ga4PropertyId: string | null;
  scopes: string[];
  databaseConfigured: boolean;
  organizationSlug: string | null;
  providers: ProviderView[];
};

export type AuditEventView = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  providerId: string | null;
  metadataText: string | null;
  createdAt: string;
};
