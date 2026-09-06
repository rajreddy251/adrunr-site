import {
  KNOWN_NOT_ENABLED_CUSTOMER_ID,
  PLATFORM_MCC_DISPLAY,
  PLATFORM_MCC_ID,
  formatCustomerId,
} from "./ids";
import type { AdsAccountView, CampaignMetricSnapshotView, SyncedCampaignView } from "./types";

export const MOCK_EMAIL = "ops@adrunr.local";

export function mockAccounts(): AdsAccountView[] {
  return [
    {
      customerId: PLATFORM_MCC_ID,
      descriptiveName: "Adrunr MCC (red4code)",
      formattedId: PLATFORM_MCC_DISPLAY,
      manager: true,
      status: "ENABLED",
      testAccount: false,
      level: 0,
      warning: null,
    },
    {
      customerId: "1234567890",
      descriptiveName: "Adrunr demo Search account",
      formattedId: formatCustomerId("1234567890"),
      manager: false,
      status: "ENABLED",
      testAccount: true,
      level: 1,
      warning: null,
    },
    {
      customerId: KNOWN_NOT_ENABLED_CUSTOMER_ID,
      descriptiveName: "Known disabled customer",
      formattedId: formatCustomerId(KNOWN_NOT_ENABLED_CUSTOMER_ID),
      manager: false,
      status: "NOT_ENABLED",
      testAccount: false,
      level: 1,
      warning:
        "CUSTOMER_NOT_ENABLED — known for 485-651-7690. Listed for visibility; mutations are blocked.",
    },
  ];
}

export function mockGa4Report(propertyId: string) {
  return {
    propertyId: propertyId || "unset",
    stub: true,
    source: "mock",
    dateRange: { startDate: "7daysAgo", endDate: "today" },
    metrics: ["sessions", "conversions"],
    rows: [
      { date: "2026-08-31", sessions: 128, conversions: 4 },
      { date: "2026-09-01", sessions: 141, conversions: 6 },
      { date: "2026-09-02", sessions: 119, conversions: 3 },
    ],
    totals: { sessions: 388, conversions: 13 },
    note: "Placeholder GA4 report (ADRUNR_MOCK). Soft-fails live when GA4_PROPERTY_ID or Analytics scope is missing.",
  };
}

export function mockListings(customerId: string): SyncedCampaignView[] {
  return [
    {
      externalId: "1111111111",
      resourceName: `customers/${customerId}/campaigns/1111111111`,
      name: "Demo Search — Brand",
      advertisingChannelType: "SEARCH",
      status: "PAUSED",
      servingStatus: "PENDING",
      biddingStrategyType: "MANUAL_CPC",
      lastSyncedAt: null,
      adGroups: [
        {
          externalId: "2222222222",
          resourceName: `customers/${customerId}/adGroups/2222222222`,
          name: "Brand exact",
          status: "PAUSED",
          type: "SEARCH_STANDARD",
          ads: [
            {
              externalId: "3333333333",
              resourceName: `customers/${customerId}/adGroupAds/2222222222~3333333333`,
              name: "Brand RSA",
              type: "RESPONSIVE_SEARCH_AD",
              status: "PAUSED",
              headlinesText: "Adrunr ads ops\nPaused Search demo\nCreate without spend",
              descriptionsText: "Read-only sync fixture.\nWizards stay PAUSED.",
              finalUrl: "https://adrunr.com",
            },
          ],
          keywords: [
            {
              externalId: "4444444444",
              resourceName: `customers/${customerId}/adGroupCriteria/2222222222~4444444444`,
              text: "adrunr ads",
              matchType: "EXACT",
              status: "ENABLED",
              isNegative: false,
            },
            {
              externalId: "4444444445",
              resourceName: `customers/${customerId}/adGroupCriteria/2222222222~4444444445`,
              text: "enable spend",
              matchType: "PHRASE",
              status: "ENABLED",
              isNegative: true,
            },
          ],
        },
      ],
    },
    {
      externalId: "5555555555",
      resourceName: `customers/${customerId}/campaigns/5555555555`,
      name: "Demo Display — Prospecting",
      advertisingChannelType: "DISPLAY",
      status: "ENABLED",
      servingStatus: "SERVING",
      biddingStrategyType: "MAXIMIZE_CONVERSIONS",
      lastSyncedAt: null,
      adGroups: [
        {
          externalId: "6666666666",
          resourceName: `customers/${customerId}/adGroups/6666666666`,
          name: "Prospecting",
          status: "ENABLED",
          type: "DISPLAY_STANDARD",
          ads: [
            {
              externalId: "7777777777",
              resourceName: `customers/${customerId}/adGroupAds/6666666666~7777777777`,
              name: "Display RDA",
              type: "RESPONSIVE_DISPLAY_AD",
              status: "ENABLED",
              headlinesText: "Ops tools, not autopilot",
              descriptionsText: "Cached ENABLED is a snapshot. Sync never unpauses live Ads.",
              finalUrl: "https://adrunr.com/ops",
            },
          ],
          keywords: [],
        },
      ],
    },
  ];
}

export function mockMetrics(
  customerId: string,
  dateFrom: string,
  dateTo: string,
): CampaignMetricSnapshotView[] {
  return [
    {
      externalCampaignId: "1111111111",
      resourceName: `customers/${customerId}/campaigns/1111111111`,
      campaignName: "Demo Search — Brand",
      advertisingChannelType: "SEARCH",
      campaignStatus: "PAUSED",
      currencyCode: "USD",
      budgetResourceName: `customers/${customerId}/campaignBudgets/111`,
      budgetAmountMicros: "25000000",
      budgetPeriod: "DAILY",
      dateFrom,
      dateTo,
      costMicros: "0",
      impressions: "0",
      clicks: "0",
      conversionsText: "0",
      conversionsValueText: "0",
      averageCpcMicros: null,
      averageCpmMicros: null,
      lastSyncedAt: null,
    },
    {
      externalCampaignId: "5555555555",
      resourceName: `customers/${customerId}/campaigns/5555555555`,
      campaignName: "Demo Display — Prospecting",
      advertisingChannelType: "DISPLAY",
      campaignStatus: "ENABLED",
      currencyCode: "USD",
      budgetResourceName: `customers/${customerId}/campaignBudgets/555`,
      budgetAmountMicros: "40000000",
      budgetPeriod: "DAILY",
      dateFrom,
      dateTo,
      costMicros: "123450000",
      impressions: "18420",
      clicks: "312",
      conversionsText: "9.5",
      conversionsValueText: "480.25",
      averageCpcMicros: "395673",
      averageCpmMicros: "6701954",
      lastSyncedAt: null,
    },
  ];
}
