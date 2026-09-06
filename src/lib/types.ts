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

export type SearchDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  enhancedCpcEnabled: boolean;
  targetCpaMicros: string | null;
  targetRoasText: string | null;
  targetGoogleSearch: boolean;
  targetSearchNetwork: boolean;
  targetContentNetwork: boolean;
  targetPartnerSearchNetwork: boolean;
  startDate: string | null;
  endDate: string | null;
  statusDraft: string;
  googleCampaignResourceName: string | null;
  campaignOpId: string | null;
  notesText: string | null;
  createdAt: string;
  updatedAt: string;
  adGroups: Array<{
    id: string;
    name: string;
    defaultBidMicros: string;
    sortOrder: number;
    googleAdGroupResourceName: string | null;
    keywords: Array<{
      id: string;
      text: string;
      matchType: string;
      bidMicros: string | null;
      isNegative: boolean;
      googleCriterionResourceName: string | null;
    }>;
    ads: Array<{
      id: string;
      headlines: string[];
      descriptions: string[];
      finalUrl: string;
      path1: string | null;
      path2: string | null;
      googleAdResourceName: string | null;
    }>;
  }>;
  targets: Array<{
    id: string;
    type: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
};

export type AssistantMessageView = {
  id: string;
  threadId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  metadataText: string | null;
  createdAt: string;
};

export type AssistantThreadView = {
  id: string;
  organizationId: string;
  clientId: string;
  draftId: string | null;
  createdById: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessageView[];
};

export type AssistantQuestion = {
  id: string;
  question: string;
  field?: string;
  optional?: boolean;
};

export type ClientMemoryFact = {
  key: string;
  value: string;
  source: string;
};
