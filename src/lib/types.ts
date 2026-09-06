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

export type AppDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  goal: string;
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
  platforms: Array<{
    id: string;
    platform: string;
    appId: string;
    included: boolean;
    sortOrder: number;
  }>;
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
};

export type HotelDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  hotelCenterId: string | null;
  percentCpcCeilingMicros: string | null;
  commissionRateText: string | null;
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
    listings: Array<{
      id: string;
      kind: string;
      valueText: string;
      hotelIdText: string;
      included: boolean;
      sortOrder: number;
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

export type LocalDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  goal: string;
  targetCpaMicros: string | null;
  targetRoasText: string | null;
  businessName: string | null;
  finalUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  statusDraft: string;
  googleCampaignResourceName: string | null;
  campaignOpId: string | null;
  notesText: string | null;
  createdAt: string;
  updatedAt: string;
  locations: Array<{
    id: string;
    kind: string;
    valueText: string;
    placeIdText: string;
    addressText: string;
    included: boolean;
    sortOrder: number;
  }>;
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
      finalUrl: string;
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

export type LocalServicesDraftClientView = {
  id: string;
  customerId: string;
  externalAccountId: string;
  name: string;
  dailyBudgetMicros: string;
  biddingStrategy: string;
  maxLeadBidMicros: string | null;
  businessName: string | null;
  licenseText: string | null;
  insuranceText: string | null;
  googleGuaranteed: boolean;
  startDate: string | null;
  endDate: string | null;
  statusDraft: string;
  googleCampaignResourceName: string | null;
  campaignOpId: string | null;
  notesText: string | null;
  createdAt: string;
  updatedAt: string;
  categories: Array<{
    id: string;
    kind: string;
    categoryId: string;
    valueText: string;
    included: boolean;
    sortOrder: number;
  }>;
  targets: Array<{
    id: string;
    type: string;
    valueText: string;
    criterionText: string;
    included: boolean;
  }>;
};

export type AssistantCampaignKind =
  | "SEARCH"
  | "DISPLAY"
  | "PMAX"
  | "DEMAND_GEN"
  | "VIDEO"
  | "SHOPPING"
  | "APP"
  | "HOTEL"
  | "LOCAL"
  | "LOCAL_SERVICES";

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
  appDraftId: string | null;
  hotelDraftId: string | null;
  localDraftId: string | null;
  localServicesDraftId: string | null;
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

export type SyncedKeywordView = {
  id?: string;
  externalId: string;
  resourceName: string | null;
  text: string;
  matchType: string | null;
  status: string | null;
  isNegative: boolean;
};

export type SyncedAdView = {
  id?: string;
  externalId: string;
  resourceName: string | null;
  name: string | null;
  type: string | null;
  status: string | null;
  headlinesText: string | null;
  descriptionsText: string | null;
  finalUrl: string | null;
};

export type SyncedAdGroupView = {
  id?: string;
  externalId: string;
  resourceName: string | null;
  name: string;
  status: string | null;
  type: string | null;
  ads: SyncedAdView[];
  keywords: SyncedKeywordView[];
};

export type SyncedCampaignView = {
  id?: string;
  externalId: string;
  resourceName: string | null;
  name: string;
  advertisingChannelType: string | null;
  status: string | null;
  servingStatus: string | null;
  biddingStrategyType: string | null;
  lastSyncedAt: string | null;
  adGroups: SyncedAdGroupView[];
};

export type SyncJobView = {
  id: string;
  jobType: string;
  status: string;
  readOnly: boolean;
  dryRun: boolean;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  counts?: ListingSyncCounts;
};

export type ListingSyncCounts = {
  campaigns: number;
  adGroups: number;
  ads: number;
  keywords: number;
};
