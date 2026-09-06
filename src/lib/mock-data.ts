import {
  KNOWN_NOT_ENABLED_CUSTOMER_ID,
  PLATFORM_MCC_DISPLAY,
  PLATFORM_MCC_ID,
  formatCustomerId,
} from "./ids";
import type { AdsAccountView } from "./types";

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
