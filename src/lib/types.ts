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

export type DisplayDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  enhancedCpcEnabled: boolean;
  targetCpaMicros: string | null;
  targetRoasText: string | null;
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
    ads: Array<{
      id: string;
      headlines: string[];
      longHeadline: string;
      descriptions: string[];
      businessName: string;
      finalUrl: string;
      googleAdResourceName: string | null;
      assets: Array<{
        id: string;
        kind: string;
        urlText: string;
        assetResourceName: string | null;
        sortOrder: number;
      }>;
    }>;
  }>;
  targets: Array<{
    id: string;
    type: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
  audiences: Array<{
    id: string;
    kind: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
};

export type PmaxDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  targetCpaMicros: string | null;
  targetRoasText: string | null;
  urlExpansionOptOut: boolean;
  brandGuidelinesEnabled: boolean;
  merchantCenterId: string | null;
  startDate: string | null;
  endDate: string | null;
  statusDraft: string;
  googleCampaignResourceName: string | null;
  campaignOpId: string | null;
  notesText: string | null;
  createdAt: string;
  updatedAt: string;
  assetGroups: Array<{
    id: string;
    name: string;
    finalUrl: string;
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    businessName: string;
    sortOrder: number;
    googleAssetGroupResourceName: string | null;
    assets: Array<{
      id: string;
      kind: string;
      urlText: string;
      assetResourceName: string | null;
      sortOrder: number;
    }>;
    listings: Array<{
      id: string;
      kind: string;
      valueText: string;
      dimensionText: string;
      included: boolean;
    }>;
  }>;
  targets: Array<{
    id: string;
    type: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
  signals: Array<{
    id: string;
    kind: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
};

export type DemandGenDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  targetCpaMicros: string | null;
  targetRoasText: string | null;
  youtubeInStream: boolean;
  youtubeInFeed: boolean;
  youtubeShorts: boolean;
  discover: boolean;
  gmail: boolean;
  display: boolean;
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
    ads: Array<{
      id: string;
      headlines: string[];
      descriptions: string[];
      businessName: string;
      finalUrl: string;
      callToActionText: string | null;
      googleAdResourceName: string | null;
      assets: Array<{
        id: string;
        kind: string;
        urlText: string;
        assetResourceName: string | null;
        sortOrder: number;
      }>;
    }>;
  }>;
  targets: Array<{
    id: string;
    type: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
  audiences: Array<{
    id: string;
    kind: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
};

export type VideoDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  maxCpvMicros: string | null;
  targetCpmMicros: string | null;
  targetCpaMicros: string | null;
  inStream: boolean;
  bumper: boolean;
  inFeed: boolean;
  shorts: boolean;
  outstream: boolean;
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
    ads: Array<{
      id: string;
      headlines: string[];
      descriptions: string[];
      longHeadline: string | null;
      finalUrl: string;
      callToActionText: string | null;
      googleAdResourceName: string | null;
      assets: Array<{
        id: string;
        kind: string;
        urlText: string;
        assetResourceName: string | null;
        sortOrder: number;
      }>;
    }>;
  }>;
  targets: Array<{
    id: string;
    type: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
  audiences: Array<{
    id: string;
    kind: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
};

export type ShoppingDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  merchantCenterId: string | null;
  salesCountry: string;
  campaignPriority: string;
  enableLocal: boolean;
  targetRoasText: string | null;
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
    productGroups: Array<{
      id: string;
      kind: string;
      valueText: string;
      dimensionText: string;
      included: boolean;
      sortOrder: number;
      googleListingGroupResourceName: string | null;
    }>;
    listings: Array<{
      id: string;
      kind: string;
      valueText: string;
      dimensionText: string;
      included: boolean;
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

export type AssistantCampaignKind = "SEARCH" | "DISPLAY" | "PMAX" | "DEMAND_GEN" | "VIDEO" | "SHOPPING";

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
  displayDraftId: string | null;
  pmaxDraftId: string | null;
  demandGenDraftId: string | null;
  videoDraftId: string | null;
  shoppingDraftId: string | null;
  kind: AssistantCampaignKind;
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
